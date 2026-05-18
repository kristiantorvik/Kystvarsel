import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';

import { getShowCrosshair } from '../data/settingsRepository';

/**
 * Reads the "show crosshair" setting and keeps the value fresh whenever
 * the consuming screen regains focus — so toggling the setting in
 * Innstillinger and navigating back to a map view updates the crosshair
 * without requiring an app restart or map remount.
 *
 * Default value is `false`; the actual stored value loads asynchronously
 * on first focus. A one-frame flash on first mount is acceptable for a
 * purely cosmetic overlay.
 */
export function useShowCrosshair(): boolean {
  const [show, setShow] = useState(false);
  useFocusEffect(
    useCallback(() => {
      let active = true;
      getShowCrosshair().then((v) => {
        if (active) setShow(v);
      });
      return () => {
        active = false;
      };
    }, []),
  );
  return show;
}
