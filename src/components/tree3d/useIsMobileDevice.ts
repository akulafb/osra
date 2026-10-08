import { useEffect, useState } from 'react';
import { isMobile } from '../../utils/device';

export function useIsMobileDevice(): boolean {
  const [isMobileDevice, setIsMobileDevice] = useState(
    () => typeof window !== 'undefined' && isMobile()
  );

  useEffect(() => {
    const update = () => setIsMobileDevice(isMobile());
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  return isMobileDevice;
}
