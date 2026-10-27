import type { Role } from './session';

export type Area = 'judge' | 'admin' | 'main';

// 첫 라벨이 judge / admin 이면 해당 영역, 그 외는 메인(user)
export function areaOf(host: string): Area {
  const first = host.split('.')[0];
  return first === 'judge' || first === 'admin' ? first : 'main';
}

export function rootHost(host: string) {
  return areaOf(host) === 'main' ? host : host.slice(host.indexOf('.') + 1);
}

export function hostFor(area: Area, host: string) {
  return area === 'main' ? rootHost(host) : `${area}.${rootHost(host)}`;
}

// 영역별 접근 가능 역할 (admin 은 심판 영역도 접근 가능)
export const areaRoles: Record<Exclude<Area, 'main'>, Role[]> = {
  judge: ['judge', 'admin'],
  admin: ['admin'],
};

export const homeAreaOf = (role: Role): Area => (role === 'user' ? 'main' : role);
