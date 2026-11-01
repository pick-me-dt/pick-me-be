export type Role = 'driver' | 'staff';

export interface DriverPrincipal {
  role: 'driver';
  userId: string;
  vehicleId: string;
}

export interface StaffPrincipal {
  role: 'staff';
  staffId: string;
  storeId: string;
}

export type Principal = DriverPrincipal | StaffPrincipal;
