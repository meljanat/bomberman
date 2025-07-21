export function Router({ routes = {} }) {
  let app = null;

  function handleRouteChange() {
    const hash = window.location.hash || '#/';
    const routeHandler = routes[hash];

    if (routeHandler) {
      routeHandler();
    }
  }

  return {
    start(appInstance) {
      app = appInstance;
      window.addEventListener('hashchange', handleRouteChange);
      handleRouteChange(); // Handle initial route
    },
    stop() {
      window.removeEventListener('hashchange', handleRouteChange);
    }
  };
}