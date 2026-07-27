import type { ServiceStatus } from '../api/zapretyd';

export function sameServiceStatus(
  a: ServiceStatus | undefined,
  b: ServiceStatus | undefined,
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.isAdmin === b.isAdmin &&
    a.serviceExists === b.serviceExists &&
    a.serviceRunning === b.serviceRunning &&
    a.windivertRunning === b.windivertRunning &&
    a.winwsRunning === b.winwsRunning &&
    a.activeStrategy === b.activeStrategy &&
    a.messageCode === b.messageCode
  );
}
