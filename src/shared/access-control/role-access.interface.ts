export interface RoleAccessProvider<Req = any> {
  roleName: string;
  applyFilter?(userId: string, req: Req): Promise<Req>;
  verifyAccessToResource?(resourceId: string, userId: string): Promise<void>;
}
