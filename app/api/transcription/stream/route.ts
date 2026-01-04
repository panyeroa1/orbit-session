import { NextRequest } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// In-memory store for active transcription streams
// In production, use Redis or similar for multi-instance support
const activeStreams = new Map<string, Set<ReadableStreamDefaultController>>();

export type TranscriptEvent = {
  type: 'transcript' | 'speaker_change' | 'connection';
  meetingId: string;
  speakerId?: string;
  speakerName?: string;
  text?: string;
  timestamp: number;
  isFinal?: boolean;
  language?: string;
};

/**
 * SSE Endpoint for real-time transcription streaming
 * 
 * Query Parameters:
 * - meetingId: Required. The room/meeting identifier
 * - speakerId: Optional. Filter to a specific speaker
 * 
 * Example: GET /api/transcription/stream?meetingId=room-abc-123
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const meetingId = searchParams.get('meetingId');

  if (!meetingId) {
    return new Response('meetingId is required', { status: 400 });
  }

  const speakerFilter = searchParams.get('speakerId');

  // Create SSE stream
  const stream = new ReadableStream({
    start(controller) {
      // Register this controller for the meeting
      if (!activeStreams.has(meetingId)) {
        activeStreams.set(meetingId, new Set());
      }
      activeStreams.get(meetingId)!.add(controller);

      // Send connection confirmation
      const connectionEvent: TranscriptEvent = {
        type: 'connection',
        meetingId,
        timestamp: Date.now(),
        text: 'Connected to transcription stream',
      };
      controller.enqueue(`data: ${JSON.stringify(connectionEvent)}\n\n`);

      // Cleanup on close
      request.signal.addEventListener('abort', () => {
        activeStreams.get(meetingId)?.delete(controller);
        if (activeStreams.get(meetingId)?.size === 0) {
          activeStreams.delete(meetingId);
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}

/**
 * POST endpoint to publish transcript segments to all listeners
 * 
 * Body:
 * {
 *   meetingId: string,
 *   speakerId: string,
 *   speakerName: string,
 *   text: string,
 *   isFinal: boolean,
 *   language?: string
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { meetingId, speakerId, speakerName, text, isFinal, language } = body;

    if (!meetingId || !text) {
      return new Response('meetingId and text are required', { status: 400 });
    }

    const event: TranscriptEvent = {
      type: 'transcript',
      meetingId,
      speakerId: speakerId || 'unknown',
      speakerName: speakerName || 'Unknown Speaker',
      text,
      timestamp: Date.now(),
      isFinal: isFinal ?? true,
      language: language || 'auto',
    };

    // Broadcast to all listeners for this meeting
    const listeners = activeStreams.get(meetingId);
    if (listeners && listeners.size > 0) {
      const message = `data: ${JSON.stringify(event)}\n\n`;
      listeners.forEach((controller) => {
        try {
          controller.enqueue(message);
        } catch {
          // Controller may be closed
          listeners.delete(controller);
        }
      });
    }

    return Response.json({
      success: true,
      listeners: listeners?.size || 0,
    });
  } catch (error) {
    console.error('Transcription stream POST error:', error);
    return new Response('Internal error', { status: 500 });
  }
}
