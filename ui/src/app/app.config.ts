import { ApplicationConfig, inject, provideAppInitializer, provideBrowserGlobalErrorListeners, provideZonelessChangeDetection } from '@angular/core';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { MAT_FORM_FIELD_DEFAULT_OPTIONS } from '@angular/material/form-field';
import { MatIconRegistry } from '@angular/material/icon';
import { routes } from './app.routes';
import { apiBaseInterceptor, config, loadConfig } from './core/config';
import { DATA_MODE } from './core/data-mode';
import { provideRouteReporter } from './core/route-reporter';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideAppInitializer(loadConfig),
    // icons: the Material Symbols font (loaded in index.html)
    provideAppInitializer(() => { inject(MatIconRegistry).setDefaultFontSetClass('material-symbols-outlined'); }),
    provideRouter(routes),
    // framed by the home-dashboards wrapper: tell it the page, for its address bar and shared links
    provideRouteReporter(() => config().frameParents),
    provideHttpClient(withFetch(), withInterceptors([apiBaseInterceptor, ...DATA_MODE.interceptors])),
    { provide: MAT_FORM_FIELD_DEFAULT_OPTIONS, useValue: { appearance: 'outline', subscriptSizing: 'dynamic' } },
  ],
};
