export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  message: string;
  user: {
    _id: string;
    username: string;
    email: string;
    role: string;
    avatar?: string;
  };
  accessToken: string;
  refreshToken: string;
}

export interface RegisterRequest {
  username: string;
  email: string;
  password: string;
  role: 'Rédacteur' | 'Lecteur';
}

export interface RegisterResponse {
  message: string;
  user: {
    _id: string;
    username: string;
    email: string;
    role: string;
    avatar?: string;
  };
  accessToken: string;
  refreshToken: string;
}

export interface SendOtpRequest {
  email: string;
  type?: 'email_verification' | 'password_reset';
}

export interface SendOtpResponse {
  message: string;
}

export interface VerifyOtpRequest {
  email: string;
  code: string;
  type?: 'email_verification' | 'password_reset';
  token?: string; // Required for password_reset type
}

export interface VerifyOtpResponse {
  message: string;
  token?: string; // For password_reset type
  expiresInMinutes?: number; // For password_reset type
}

export interface ResetPasswordRequest {
  password: string;
  confirmPassword: string;
}

export interface ResetPasswordResponse {
  message: string;
}

export interface User {
  _id: string;
  username: string;
  email: string;
  role: string;
  avatar?: string;
}
