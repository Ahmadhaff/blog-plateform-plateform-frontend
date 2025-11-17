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
