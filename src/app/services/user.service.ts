import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';

import { environment } from '../../environments/environment';

export interface UserProfile {
  _id: string;
  username: string;
  email: string;
  role: string;
  avatar?: string;
  verified: boolean;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface UpdateProfileRequest {
  username?: string;
}

export interface UpdateProfileResponse {
  message: string;
  user: UserProfile;
}

export interface UploadAvatarResponse {
  message: string;
  user: UserProfile;
}

@Injectable({
  providedIn: 'root'
})
export class UserService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/users`;

  private getAuthHeaders(): HttpHeaders {
    const token = localStorage.getItem('token');
    return new HttpHeaders({
      'Authorization': `Bearer ${token}`
    });
  }

  getProfile(): Observable<{ user: UserProfile }> {
    return this.http.get<{ user: UserProfile }>(`${this.baseUrl}/me`, {
      headers: this.getAuthHeaders()
    });
  }

  updateProfile(data: UpdateProfileRequest): Observable<UpdateProfileResponse> {
    return this.http.put<UpdateProfileResponse>(`${this.baseUrl}/me`, data, {
      headers: this.getAuthHeaders()
    });
  }

  uploadAvatar(file: File): Observable<UploadAvatarResponse> {
    const formData = new FormData();
    formData.append('avatar', file);

    return this.http.post<UploadAvatarResponse>(`${this.baseUrl}/me/avatar`, formData, {
      headers: this.getAuthHeaders()
    });
  }
}

