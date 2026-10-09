export type Tab = 'home' | 'farms' | 'map' | 'report' | 'history' | 'community' | 'profile' | 'support';

export type RegisterFields = {
  name: string;
  email: string;
  password: string;
  propertyName: string;
  province: string;
  municipality: string;
  barangay: string;
  sizeHectares: string;
};
