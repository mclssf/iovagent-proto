(function () {
  let loaderPromise;

  function loadLoader() {
    if (window.AMapLoader) return Promise.resolve();
    if (loaderPromise) return loaderPromise;
    loaderPromise = new Promise(function (resolve, reject) {
      var script = document.createElement('script');
      script.src = 'https://webapi.amap.com/loader.js';
      script.async = true;
      script.onload = resolve;
      script.onerror = function () { reject(new Error('高德地图加载器加载失败')); };
      document.head.appendChild(script);
    });
    return loaderPromise;
  }

  function serviceHost() {
    return new URL('/_AMapService', window.location.origin).toString();
  }

  async function load(plugins) {
    var config = window.__IOV_AMAP_CONFIG__ || {};
    if (!config.key) throw new Error('缺少高德地图 API Key');
    window._AMapSecurityConfig = { serviceHost: serviceHost() };
    await loadLoader();
    return window.AMapLoader.load({ key: config.key, version: '2.0', plugins: plugins || [] });
  }

  function convertGps(AMap, coordinates) {
    if (!coordinates.length) return Promise.resolve([]);
    return new Promise(function (resolve) {
      AMap.convertFrom(coordinates, 'gps', function (status, result) {
        if (status === 'complete' && result.info === 'ok' && result.locations && result.locations.length === coordinates.length) {
          resolve(result.locations.map(function (point) { return point.toArray(); }));
          return;
        }
        resolve(coordinates);
      });
    });
  }

  function drivingRoute(AMap, coordinates, policy) {
    return new Promise(function (resolve, reject) {
      if (coordinates.length < 2) { reject(new Error('路线点不足')); return; }
      var points = coordinates.slice();
      var start = points.shift();
      var end = points.pop();
      var driving = new AMap.Driving({ policy: policy || 0, showTraffic: false });
      driving.search(start, end, { waypoints: points }, function (status, result) {
        var route = result && result.routes && result.routes[0];
        var path = route && route.steps ? route.steps.flatMap(function (step) { return step.path || []; }).map(function (point) { return point.toArray(); }) : [];
        if (status !== 'complete' || path.length < 2) { reject(new Error('高德驾车路线规划失败')); return; }
        resolve({ path: path, distance: route.distance || 0, duration: route.time || 0 });
      });
    });
  }

  window.IovAmap = { convertGps: convertGps, drivingRoute: drivingRoute, load: load };
})();
