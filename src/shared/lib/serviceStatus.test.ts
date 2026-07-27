import { describe, expect, it } from 'vitest';
import type { ServiceStatus } from '../api/zapretyd';
import { sameServiceStatus } from './serviceStatus';

const base: ServiceStatus = {
  isAdmin: true,
  serviceExists: true,
  serviceRunning: true,
  windivertRunning: false,
  winwsRunning: true,
  activeStrategy: 'general.bat',
  messageCode: 'service.detected',
};

describe('sameServiceStatus', () => {
  it('treats identical snapshots as equal', () => {
    expect(sameServiceStatus(base, { ...base })).toBe(true);
  });

  it('detects field changes', () => {
    expect(sameServiceStatus(base, { ...base, serviceRunning: false })).toBe(false);
    expect(sameServiceStatus(base, { ...base, activeStrategy: 'other.bat' })).toBe(false);
    expect(
      sameServiceStatus(base, { ...base, strategyActivatedAt: '2026-07-27T12:00:00Z' }),
    ).toBe(false);
    expect(sameServiceStatus(base, { ...base, serviceStartedAt: '2026-07-27T12:00:00Z' })).toBe(
      false,
    );
  });

  it('handles undefined', () => {
    expect(sameServiceStatus(undefined, undefined)).toBe(true);
    expect(sameServiceStatus(base, undefined)).toBe(false);
  });
});
