export type Tab = 'home' | 'farms' | 'report' | 'history' | 'community' | 'profile' | 'support';

export type RegisterFields = {
  name: string;
  username: string;
  email: string;
  phoneNumber: string;
  password: string;
  propertyName: string;
  province: string;
  municipality: string;
  barangay: string;
  address: string;
  sizeHectares: string;
};
