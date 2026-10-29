import { ApplicationConfig, provideAppInitializer, provideBrowserGlobalErrorListeners, provideZonelessChangeDetection } from '@angular/core';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { apiBaseInterceptor, loadConfig } from './config';
import { DATA_MODE } from './data-mode';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideAppInitializer(loadConfig),
    provideHttpClient(withFetch(), withInterceptors([apiBaseInterceptor, ...DATA_MODE.interceptors])),
  ],
};
