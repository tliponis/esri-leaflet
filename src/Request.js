import L from 'leaflet';
import Support from './Support';
import {warn} from './Util';

var callbacks = 0;

window._EsriLeafletCallbacks = {};

function serialize (params) {
  var data = '';

  params.f = params.f || 'json';

  for (var key in params) {
    if (params.hasOwnProperty(key)) {
      var param = params[key];
      var type = Object.prototype.toString.call(param);
      var value;

      if (data.length) {
        data += '&';
      }

      if (type === '[object Array]') {
        value = (Object.prototype.toString.call(param[0]) === '[object Object]') ? JSON.stringify(param) : param.join(',');
      } else if (type === '[object Object]') {
        value = JSON.stringify(param);
      } else if (type === '[object Date]') {
        value = param.valueOf();
      } else {
        value = param;
      }

      data += encodeURIComponent(key) + '=' + encodeURIComponent(value);
    }
  }

  return data;
}

function createRequest (callback, context) {
  var httpRequest = new window.XMLHttpRequest();

  httpRequest.onerror = function (e) {
    httpRequest.onreadystatechange = L.Util.falseFn;

    callback.call(context, {
      error: {
        code: 500,
        message: 'XMLHttpRequest error'
      }
    }, null);
  };

  httpRequest.onreadystatechange = function () {
    var response;
    var error;

    if (httpRequest.readyState === 4) {
      try {
        response = JSON.parse(httpRequest.responseText);
      } catch(e) {
        response = null;
        error = {
          code: 500,
          message: 'Could not parse response as JSON. This could also be caused by a CORS or XMLHttpRequest error.'
        };
      }

      if (!error && response.error) {
        error = response.error;
        response = null;
      }

      httpRequest.onerror = L.Util.falseFn;

      callback.call(context, error, response);
    }
  };

  return httpRequest;
}

function xmlHttpPost (url, params, callback, context) {
  var httpRequest = createRequest(callback, context);
  httpRequest.open('POST', url);
  httpRequest.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
  httpRequest.send(serialize(params));

  return httpRequest;
}

function xmlHttpGet (url, params, callback, context) {
  var httpRequest = createRequest(callback, context);

  httpRequest.open('GET', url + '?' + serialize(params), true);
  httpRequest.send(null);

  return httpRequest;
}

// AJAX handlers for CORS (modern browsers) or JSONP (older browsers)
export function request (url, params, callback, context) {
  var paramString = serialize(params);
  var httpRequest = createRequest(callback, context);
  var requestLength = (url + '?' + paramString).length;

  // request is less then 2000 characters and the browser supports CORS, make GET request with XMLHttpRequest
  if (requestLength <= 2000 && Support.cors) {
    httpRequest.open('GET', url + '?' + paramString);
    httpRequest.send(null);

  // request is less more then 2000 characters and the browser supports CORS, make POST request with XMLHttpRequest
  } else if (requestLength > 2000 && Support.cors) {
    httpRequest.open('POST', url);
    httpRequest.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
    httpRequest.send(paramString);

  // request is less more then 2000 characters and the browser does not support CORS, make a JSONP request
  } else if (requestLength <= 2000 && !Support.cors) {
    return jsonp(url, params, callback, context);

  // request is longer then 2000 characters and the browser does not support CORS, log a warning
  } else {
    warn('a request to ' + url + ' was longer then 2000 characters and this browser cannot make a cross-domain post request. Please use a proxy http://esri.github.io/esri-leaflet/api-reference/request.html');
    return;
  }

  return httpRequest;
}

export function jsonp (url, params, callback, context) {
  var callbackId = 'c' + callbacks;

  params.callback = 'window._EsriLeafletCallbacks.' + callbackId;

  var script = L.DomUtil.create('script', null, document.body);
  script.type = 'text/javascript';
  script.src = url + '?' + serialize(params);
  script.id = callbackId;

  window._EsriLeafletCallbacks[callbackId] = function (response) {
    if (window._EsriLeafletCallbacks[callbackId] !== true) {
      var error;
      var responseType = Object.prototype.toString.call(response);

      if (!(responseType === '[object Object]' || responseType === '[object Array]')) {
        error = {
          error: {
            code: 500,
            message: 'Expected array or object as JSONP response'
          }
        };
        response = null;
      }

      if (!error && response.error) {
        error = response;
        response = null;
      }

      callback.call(context, error, response);
      window._EsriLeafletCallbacks[callbackId] = true;
    }
  };

  callbacks++;

  return {
    id: callbackId,
    url: script.src,
    abort: function () {
      window._EsriLeafletCallbacks._callback[callbackId]({
        code: 0,
        message: 'Request aborted.'
      });
    }
  };
}

var get = ((Support.cors) ? xmlHttpGet : jsonp);
get.CORS = xmlHttpGet;
get.JSONP = jsonp;

// choose the correct AJAX handler depending on CORS support
export { get };

// always use XMLHttpRequest for posts
export { xmlHttpPost as post };

// export the Request object to call the different handlers for debugging
export var Request = {
  request: request,
  get: get,
  post: xmlHttpPost
};

export default Request;
