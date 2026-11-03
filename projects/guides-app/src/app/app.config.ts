import { ApplicationConfig, provideBrowserGlobalErrorListeners } from "@angular/core";
import { provideHttpClient } from "@angular/common/http";
import { provideRouter } from "@angular/router";

import { provideAuth0 } from "@auth0/auth0-angular";

import { AUTH0_PUBLIC } from "@lib/constants/auth0-config.constants";

import { routes } from "./app.routes";


export const appConfig: ApplicationConfig = {
    providers: [
        provideBrowserGlobalErrorListeners(),
        provideHttpClient(),
        provideRouter(routes),

        provideAuth0({
            domain: AUTH0_PUBLIC.domain,
            clientId: AUTH0_PUBLIC.clientId,
            cacheLocation: "localstorage",
            useRefreshTokens: true,
            authorizationParams: {
                // eslint-disable-next-line camelcase
                redirect_uri: `${window.location.origin}/`,
                audience: AUTH0_PUBLIC.audience,
                scope: "openid profile email",
            },
        }),
    ],
};
