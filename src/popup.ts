import { parseQueryString, getFullUrlPath } from './utils';

export interface IPopup {
  open(url: string, name: string, popupOptions: { width: number, height: number }, redirectUri: string): void;
  stringifyOptions (options: any): string;
  polling(redirectUri: string): angular.IPromise<any>;
  eventListener(redirectUri: string): angular.IPromise<any>;
}

export default class Popup implements IPopup {
  static $inject = ['$interval', '$window', '$q'];

  public popup: any;
  private url: string;
  private defaults: { redirectUri: string };

  constructor(private $interval: angular.IIntervalService,
              private $window: angular.IWindowService,
              private $q: angular.IQService) {
    this.popup = null;
    this.defaults = {
      redirectUri: null
    };
  }

  stringifyOptions (options: any): string {
    const parts = [];
    angular.forEach(options, function (value, key) {
      parts.push(key + '=' + value);
    });
    return parts.join(',');
  }

  open(url: string,
       name: string,
       popupOptions: { width: number, height: number },
       redirectUri: string,
       dontPoll?: boolean): angular.IPromise<any> {
    const width = popupOptions.width || 500;
    const height = popupOptions.height || 500;

    const options = this.stringifyOptions({
      width: width,
      height: height,
      top: this.$window.screenY + ((this.$window.outerHeight - height) / 2.5),
      left: this.$window.screenX + ((this.$window.outerWidth - width) / 2)
    });

    const popupName = this.$window['cordova'] || this.$window.navigator.userAgent.indexOf('CriOS') > -1 ? '_blank' : name;

    this.popup = this.$window.open(url, popupName, options);

    if (this.popup && this.popup.focus) {
      this.popup.focus();
    }

    if (dontPoll) {
      return;
    }

    if (this.$window['cordova']) {
      return this.eventListener(redirectUri);
    } else {
      if (url === 'about:blank') {
        this.popup.location = url;
      }
      return this.polling(redirectUri);
    }

  }

  polling(redirectUri: string): angular.IPromise<any> {
    return this.$q((resolve, reject) => {
      this.$window.postMessage({
        type: 'ROBIN_SSO_BREADCRUMB',
        message: 'Starting poll.',
        source: 'satellizer'
      }, '*');
      const redirectUriParser = document.createElement('a');
      redirectUriParser.href = redirectUri;
      const redirectUriPath = getFullUrlPath(redirectUriParser);
      let intervalState = 0;

      const polling = this.$interval(() => {
        const shouldLogInThisIteration = intervalState % 5 === 0;
        intervalState += 1;
        if (shouldLogInThisIteration) {
          // Log this breadcrumb every 2.5 seconds.
          this.$window.postMessage({
            type: 'ROBIN_SSO_BREADCRUMB',
            message: 'Polling.',
            source: 'satellizer'
          }, '*');
        }
        if (!this.popup || this.popup.closed || this.popup.closed === undefined) {
          this.$window.postMessage({
            type: 'ROBIN_SSO_BREADCRUMB',
            message: 'Popup closed.',
            source: 'satellizer'
          }, '*');
          this.$interval.cancel(polling);
          this.$window.postMessage({
            type: 'ROBIN_SSO_BREADCRUMB',
            message: 'Interval canceled.',
            source: 'satellizer'
          }, '*');
          this.$window.postMessage({
            type: 'ROBIN_SSO_LOG',
            message: 'SSO window was closed.',
            source: 'satellizer'
          }, '*');
          reject(new Error('The popup window was closed'));
        }

        try {
          const popupWindowPath = getFullUrlPath(this.popup.location);

          if (popupWindowPath === redirectUriPath) {
            this.$window.postMessage({
              type: 'ROBIN_SSO_BREADCRUMB',
              message: 'Redirect URLs match.',
              source: 'satellizer'
            }, '*');
            if (this.popup.location.search || this.popup.location.hash) {
              this.$window.postMessage({
                type: 'ROBIN_SSO_BREADCRUMB',
                message: 'Found expected query params.',
                source: 'satellizer'
              }, '*');
              const query = parseQueryString(this.popup.location.search.substring(1).replace(/\/$/, ''));
              const hash = parseQueryString(this.popup.location.hash.substring(1).replace(/[\/$]/, ''));
              const params = angular.extend({}, query, hash);

              if (params.error) {
                reject(new Error(params.error));
                this.$window.postMessage({
                  type: 'ROBIN_SSO_BREADCRUMB',
                  message: 'SSO window container error argument.',
                  error: params.error,
                  source: 'satellizer'
                }, '*');
              } else {
                resolve(params);
                this.$window.postMessage({
                  type: 'ROBIN_SSO_BREADCRUMB',
                  message: 'Resolved SSO login.',
                  source: 'satellizer'
                }, '*');
              }
            } else {
              this.$window.postMessage({
                type: 'ROBIN_SSO_LOG',
                message: 'SSO window did not have query params.',
                source: 'satellizer'
              }, '*');
              reject(new Error(
                'OAuth redirect has occurred but no query or hash parameters were found. ' +
                'They were either not set during the redirect, or were removed—typically by a ' +
                'routing library—before Satellizer could read it.'
              ));
            }

            this.$window.postMessage({
              type: 'ROBIN_SSO_BREADCRUMB',
              message: 'Detected redirect.',
              source: 'satellizer'
            }, '*');

            this.$interval.cancel(polling);
            this.$window.postMessage({
              type: 'ROBIN_SSO_BREADCRUMB',
              message: 'Canceled interval.',
              source: 'satellizer'
            }, '*');
            this.popup.close();

            this.$window.postMessage({
              type: 'ROBIN_SSO_LOG',
              message: 'Closed SSO window via polling.',
              source: 'satellizer'
            }, '*');
          }
        } catch (error) {
          // Ignore DOMException: Blocked a frame with origin from accessing a cross-origin frame.
          // A hack to get around same-origin security policy errors in IE.
          if (shouldLogInThisIteration) {
            this.$window.postMessage({
              type: 'ROBIN_SSO_BREADCRUMB',
              message: 'Encountered SSO Polling error.',
              error: error ? error.message : undefined,
              source: 'satellizer'
            }, '*');
          }
        }
      }, 500);
    });
  }

  eventListener(redirectUri): angular.IPromise<any> {
    return this.$q((resolve, reject) => {
      this.$window.postMessage({
        type: 'ROBIN_SSO_BREADCRUMB',
        message: 'Adding event listener.',
        source: 'satellizer',
        redirectUri: redirectUri
      }, '*');
      this.popup.addEventListener('loadstart', (event) => {
        this.$window.postMessage({
          type: 'ROBIN_SSO_BREADCRUMB',
          message: 'Popup window loading.',
          source: 'satellizer'
        }, '*');
        if (event.url.indexOf(redirectUri) !== 0) {
          this.$window.postMessage({
            type: 'ROBIN_SSO_BREADCRUMB',
            message: 'Polling.',
            url: event.url,
            redirectUri: redirectUri,
            source: 'satellizer'
          }, '*');
          return;
        }

        const parser = document.createElement('a');
        parser.href = event.url;

        if (parser.search || parser.hash) {
          const query = parseQueryString(parser.search.substring(1).replace(/\/$/, ''));
          const hash = parseQueryString(parser.hash.substring(1).replace(/[\/$]/, ''));
          const params = angular.extend({}, query, hash);

          if (params.error) {
            reject(new Error(params.error));
          } else {
            resolve(params);
          }
          this.popup.close();
          this.$window.postMessage({
            type: 'ROBIN_SSO_LOG',
            message: 'Closed SSO window via event listener.',
            source: 'satellizer'
          }, '*');
        }
      });

      this.popup.addEventListener('loaderror', () => {
        reject(new Error('Authorization failed'));
      });

      this.popup.addEventListener('exit', () => {
        reject(new Error('The popup window was closed'));
      });
    });
  }
}
