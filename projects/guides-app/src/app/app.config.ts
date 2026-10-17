import { ApplicationConfig, provideBrowserGlobalErrorListeners } from "@angular/core";
import { provideRouter } from "@angular/router";
import { provideHttpClient } from '@angular/common/http';
import { provideAuth0 } from '@auth0/auth0-angular';
import { AUTH0_PUBLIC } from '../../../common/auth0-config';

import { routes } from "./app.routes";

export const appConfig: ApplicationConfig = {
    providers: [
        provideBrowserGlobalErrorListeners(),
        provideRouter(routes),
        provideHttpClient(),
        provideAuth0({
            domain: AUTH0_PUBLIC.domain,
            clientId: AUTH0_PUBLIC.clientId,
            cacheLocation: 'localstorage',
            useRefreshTokens: true,
            authorizationParams: {
                redirect_uri: window.location.origin + '/',
                audience: AUTH0_PUBLIC.audience,
                scope: 'openid profile email',
            },
        }),
    ],
};
