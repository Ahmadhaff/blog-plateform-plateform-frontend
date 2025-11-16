import { Routes } from '@angular/router';
import { HomeComponent } from './pages/home/home.component';
import { ArticleDetailComponent } from './pages/article-detail/article-detail.component';
import { LoginComponent } from './pages/login/login.component';
import { RegisterComponent } from './pages/register/register.component';
import { VerifyOtpComponent } from './pages/verify-otp/verify-otp.component';
import { ForgotPasswordComponent } from './pages/forgot-password/forgot-password.component';
import { ResetPasswordComponent } from './pages/reset-password/reset-password.component';
import { SettingsMenuComponent } from './pages/settings-menu/settings-menu.component';
import { SettingsComponent } from './pages/settings/settings.component';
import { SecurityComponent } from './pages/security/security.component';
import { MyArticlesComponent } from './pages/my-articles/my-articles.component';

export const routes: Routes = [
  {
    path: '',
    component: HomeComponent
  },
  {
    path: 'article/:id',
    component: ArticleDetailComponent
  },
  {
    path: 'login',
    component: LoginComponent
  },
  {
    path: 'register',
    component: RegisterComponent
  },
  {
    path: 'verify-otp',
    component: VerifyOtpComponent
  },
  {
    path: 'forgot-password',
    component: ForgotPasswordComponent
  },
  {
    path: 'reset-password',
    component: ResetPasswordComponent
  },
  {
    path: 'my-articles',
    component: MyArticlesComponent
  },
  {
    path: 'settings',
    component: SettingsMenuComponent
  },
  {
    path: 'settings/account',
    component: SettingsComponent
  },
  {
    path: 'settings/security',
    component: SecurityComponent
  },
  {
    path: '**',
    redirectTo: ''
  }
];
