'use client';

import { useEffect } from 'react';
import { generateRoomId } from '@/lib/client-utils';
import { useRouter } from 'next/navigation';

export default function RoomsIndex() {
  const router = useRouter();

  useEffect(() => {
    const roomId = generateRoomId();
    router.replace(`/rooms/${roomId}`);
  }, [router]);

  return (
    <div style={{ 
      height: '100vh', 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'center',
      background: '#000',
      color: '#fff' 
    }}>
      Redirecting to new room...
    </div>
  );
}
