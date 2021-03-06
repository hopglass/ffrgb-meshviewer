define(['map/clientlayer', 'map/labellayer', 'map/button', 'leaflet'],
  function (ClientLayer, LabelLayer, Button, L) {
    'use strict';

    var options = {
      worldCopyJump: true,
      zoomControl: true,
      minZoom: 0
    };

    return function (config, sidebar, router, buttons) {
      var self = this;
      var savedView;

      var map;
      var layerControl;
      var baseLayers = {};

      function saveView() {
        savedView = {
          center: map.getCenter(),
          zoom: map.getZoom()
        };
      }

      function contextMenuOpenLayerMenu() {
        document.querySelector('.leaflet-control-layers').classList.add('leaflet-control-layers-expanded');
      }

      var el = document.createElement('div');
      el.classList.add('map');

      map = L.map(el, options);
      var now = new Date();
      config.mapLayers.forEach(function (item, i) {
        if ((typeof item.config.start === 'number' && item.config.start <= now.getHours()) || (typeof item.config.end === 'number' && item.config.end > now.getHours())) {
          item.config.order = item.config.start * -1;
        } else {
          item.config.order = i;
        }
      });

      config.mapLayers = config.mapLayers.sort(function (a, b) {
        return a.config.order - b.config.order;
      });

      var layers = config.mapLayers.map(function (d) {
        var layer;
        if ('url' in d) {
          var url = d.url.replace('{retina}', L.Browser.retina ? '@2x' : '');
          if ('layers' in d.config) {
            layer = L.tileLayer.wms(url, d.config);
          } else {
            layer = L.tileLayer(url);
          }
        } else {
          console.warn('Missing map url');
        }

        return {
          'name': d.name,
          'layer': layer
        };
      });

      map.addLayer(layers[0].layer);

      layers.forEach(function (d) {
        baseLayers[d.name] = d.layer;
      });

      var button = new Button(config, map, router, buttons);

      map.on('locationfound', button.locationFound);
      map.on('locationerror', button.locationError);
      map.on('dragend', saveView);
      map.on('contextmenu', contextMenuOpenLayerMenu);

      button.init();

      layerControl = L.control.layers(baseLayers, [], { position: 'bottomright' });
      layerControl.addTo(map);

      map.zoomControl.setPosition('topright');

      var clientLayer = new ClientLayer({ minZoom: config.clientZoom });
      clientLayer.addTo(map);
      clientLayer.setZIndex(5);

      var labelLayer = new LabelLayer({ minZoom: config.labelZoom });
      labelLayer.addTo(map);
      labelLayer.setZIndex(6);

      map.on('zoom', function () {
        clientLayer.redraw();
        labelLayer.redraw();
      });

      map.on('baselayerchange', function (e) {
        map.options.maxZoom = e.layer.options.maxZoom;
        clientLayer.options.maxZoom = map.options.maxZoom;
        labelLayer.options.maxZoom = map.options.maxZoom;
        if (map.getZoom() > map.options.maxZoom) {
          map.setZoom(map.options.maxZoom);
        }

        var style = document.querySelector('.css-mode:not([media="not"])');
        if (style && e.layer.options.mode !== '' && !style.classList.contains(e.layer.options.mode)) {
          style.media = 'not';
          labelLayer.updateLayer();
        }
        if (e.layer.options.mode) {
          var newStyle = document.querySelector('.css-mode.' + e.layer.options.mode);
          newStyle.media = '';
          newStyle.appendChild(document.createTextNode(''));
          labelLayer.updateLayer();
        }
      });

      var nodeDict = {};
      var linkDict = {};
      var highlight;

      function resetMarkerStyles(nodes, links) {
        Object.keys(nodes).forEach(function (d) {
          nodes[d].resetStyle();
        });

        Object.keys(links).forEach(function (d) {
          links[d].resetStyle();
        });
      }

      function setView(bounds, zoom) {
        map.fitBounds(bounds, { paddingTopLeft: [sidebar(), 0], maxZoom: (zoom ? zoom : config.nodeZoom) });
      }

      function goto(m) {
        var bounds;

        if ('getBounds' in m) {
          bounds = m.getBounds();
        } else {
          bounds = L.latLngBounds([m.getLatLng()]);
        }

        setView(bounds);

        return m;
      }

      function updateView(nopanzoom) {
        resetMarkerStyles(nodeDict, linkDict);
        var m;

        if (highlight !== undefined) {
          if (highlight.type === 'node' && nodeDict[highlight.o.nodeinfo.node_id]) {
            m = nodeDict[highlight.o.nodeinfo.node_id];
            m.setStyle({ color: 'orange', weight: 20, fillOpacity: 1, opacity: 0.7, className: 'stroke-first' });
          } else if (highlight.type === 'link' && linkDict[highlight.o.id]) {
            m = linkDict[highlight.o.id];
            m.setStyle({ weight: 4, opacity: 1, dashArray: '5, 10' });
          }
        }

        if (!nopanzoom) {
          if (m) {
            goto(m);
          } else if (savedView) {
            map.setView(savedView.center, savedView.zoom);
          } else {
            setView(config.fixedCenter);
          }
        }
      }

      self.setData = function setData(data) {
        nodeDict = {};
        linkDict = {};

        clientLayer.setData(data);
        labelLayer.setData(data, map, nodeDict, linkDict, router, config);

        updateView(true);
      };

      self.resetView = function resetView() {
        button.disableTracking();
        highlight = undefined;
        updateView();
      };

      self.gotoNode = function gotoNode(d) {
        button.disableTracking();
        highlight = { type: 'node', o: d };
        updateView();
      };

      self.gotoLink = function gotoLink(d) {
        button.disableTracking();
        highlight = { type: 'link', o: d };
        updateView();
      };

      self.gotoLocation = function gotoLocation(d) {
        button.disableTracking();
        map.setView([d.lat, d.lng], d.zoom);
      };

      self.destroy = function destroy() {
        button.clearButtons();
        map.remove();

        if (el.parentNode) {
          el.parentNode.removeChild(el);
        }
      };

      self.render = function render(d) {
        d.appendChild(el);
        map.invalidateSize();
      };

      return self;
    };
  });
