// functions and classes for HYSPLIT interactive viewer app


// a few functions first

getColor = function(d) {
    return d >= 5  ? '#800000' :
	d >= 4  ? '#ff3200' :
	d >= 3  ? '#ffb900' :
	d >= 2  ? '#b6ff41' :
	d >= 1  ? '#41ffb6' :
	d >= 0  ? '#00a4ff' :
	d >= -1 ? '#0012ff' :
	'#000080';
}

contourStyle = function(feature) {
    return {
	weight: 0,
	opacity: 1,
	color: 'white',
	fillOpacity: 0.5,
	fillColor: getColor(feature.properties.level)
    };
}

highlightFeature = function(e) {
    var contour = e.target;
    var tooltip_options = {sticky: true};
    var tooltip = L.tooltip(tooltip_options);
    contour.bindTooltip(tooltip).openTooltip();
    contour.setTooltipContent(contour.feature.properties.level_name);
}

highlightTrajectory = function(e) {
    var trajectory = e.target;
    var tooltip = L.tooltip();
    trajectory.bindTooltip(tooltip).openTooltip();
    // see if this trajectory is forward or backward
    var ncoords = trajectory.feature.properties.times.length;
    var tstart = new Date(trajectory.feature.properties.times[0]);
    var tend = new Date(trajectory.feature.properties.times[ncoords - 1]);
    var fwd = tstart < tend;
    var startend;
    if (fwd) {
	startend = 'starting';
    } else {
	startend = 'ending';
    }
    var text = 'Trajectory ' + startend + ' at ' + tstart;
    trajectory.setTooltipContent(text);
}

resetHighlight = function(e) {
    // pm_layer.resetStyle(e.target);
    // info.update();
}

zoomToFeature = function(e) {
    map.fitBounds(e.target.getBounds());
}

onEachFeature = function(feature, layer) {
    layer.on({
	mouseover: highlightFeature,
	mouseout: resetHighlight,
	click: zoomToFeature
    });
}

onEachTrajectory = function(feature, layer) {
    layer.on({
	mouseover: highlightTrajectory
	// mouseout: resetHighlight,
	// click: zoomToFeature
    });
}

var run_hysplit = function() {
    var form = $("#hysplit");
    var lat = form.find('input[name="lat"]').val();
    var lon = form.find('input[name="lon"]').val();
    // Send the data using post with element id name and name2
    var url = 'http://appsvr.asrc.cestm.albany.edu:5000?lat=' + lat + '&lon=' + lon;
    $.post(url, callback=function(text) {
	form.append('<p>Flask says:<br>' + text + '</p>');
    });
};


// classes

L.TopoJSON = L.GeoJSON.extend({
    // A lazy-loading topojson layer for leaflet. Cool right?
    addData: function (data) {
	// correctly add topojson data
	var geojson, key;
	if (data.type === "Topology") {
	    for (key in data.objects) {
		if (data.objects.hasOwnProperty(key)) {
		    geojson = topojson.feature(data, data.objects[key]);
		    L.GeoJSON.prototype.addData.call(this, geojson);
		}
	    }
	    return this;
	}
	L.GeoJSON.prototype.addData.call(this, data);
	return this;
    },
    loadData: function(url) {
	// load the data if needed
	if (!this.dataIsLoaded) {
	    this.dataIsLoaded = true;
	    var topo = this;
	    return $.getJSON(this.options.file_path, function(gjson) {
		topo.initialize(gjson, topo.options);
		// topo.dataIsLoaded = true;
	    });
	} else {
	    return $.when();
	}
    },
    addTo: function (map) {
	// make sure data is loaded before adding to map
	this.loadData(this.options.file_path);
	L.GeoJSON.prototype.addTo.call(this, map);
    },
    beforeAdd: function(map) {
	// make sure data is loaded before adding to map
	this.loadData(this.options.file_path);
    },
    dataIsLoaded: false
});

L.topoJson = function (data, options) {
    return new L.TopoJSON(data, options);
};

// the topojson part of this class came from the example by Brendan
// Vinson: https://gist.github.com/brendanvinson/0e3c3c86d96863f1c33f55454705bca7
/* 
   The MIT License (MIT)
   Copyright (c) 2016 Brendan Vinson
   Permission is hereby granted, free of charge, to any person obtaining a copy
   of this software and associated documentation files (the "Software"), to deal
   in the Software without restriction, including without limitation the rights
   to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
   copies of the Software, and to permit persons to whom the Software is
   furnished to do so, subject to the following conditions:
   The above copyright notice and this permission notice shall be included in
   all copies or substantial portions of the Software.
   THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
   IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
   FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
   AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
   LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
   OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
   THE SOFTWARE.
*/


// omg this is pure madness
L.LayerSwitcher = L.LayerGroup.extend({
    cache: [],
    values: [],
    initialize: function(options) {
	L.LayerGroup.prototype.initialize.call(this, []);
	this.values = options['values'];
	this.lazy = options['lazy'] || true;
	this.dims = this.values.map(function(x) {return x.length});
	this.ndim = this.dims.length;
	this.time = 0;
	this.height = 0;
	this.setupCache();
	if (options['makeLayer']) {
	    this.makeLayer = options['makeLayer'];
	}
    },
    setupCache: function() {
	var arr_len = 1;
	for (i = 0; i < this.ndim; i++) {
	    arr_len *= this.dims[i];
	}
	this.cache = new Array(arr_len);
    },
    indToArrayInd: function(ind) {
	// get the 1D array index
	var arr_ind = 0;
	var dim_n = 1;
	for (i = this.ndim - 2; i >= 0; i--) {
	    // gotta jump this.dims[i + 1] times farther for every
	    // index for this dimension
	    dim_n *= this.dims[i + 1];
	    arr_ind += dim_n * ind[i];
	}
	// add back that last dimension
	arr_ind += ind[this.ndim - 1];
	return arr_ind;
    },
    valToArrayInd: function(val) {
	return this.indToArrayInd(this.getValueIndex(val));
    },
    loadLayer: function(ind) {
	var arr_ind = this.indToArrayInd(ind);
	if (!this.cache[arr_ind]) {
	    this.cache[arr_ind] = this.makeLayer(ind);
	    return this.cache[arr_ind].loadData();
	} else {
	    return $.when();
	}
    },
    setIndex: function(ind) {
	this.time = ind[0];
	this.height = ind[1];
    },
    getValueIndex: function(val) {
	var ind = [];
	for (i = 0; i < this.ndim; i++) {
	    ind[i] = this.values[i].indexOf(val[i]);
	    if (ind[i] == -1) {
		throw 'Value ' + val[i] + 'not found in array dimension ' + i;
	    }
	}
	return ind;
    },
    addValue: function(val) {
	this.loadLayer(this.getValueIndex(val));
	this.addLayer(this.cache[this.valToArrayInd(val)]);
    },
    addIndex: function(ind) {
	this.loadLayer(ind);
	this.addLayer(this.cache[this.indToArrayInd(ind)]);
    },
    removeIndex: function(ind) {
	this.removeLayer(this.cache[this.indToArrayInd(ind)]);
    },
    removeValue: function(val) {
	this.removeLayer(this.cache[this.valToArrayInd(val)]);
    },
    switchToValue: function(val) {
	this.clearLayers();
	this.addValue(val);
	this.setIndex(this.getValueIndex(val));
    },
    switchToIndex: function(ind) {
	this.clearLayers();
	this.addIndex(ind);
	this.setIndex(ind);
    },
    // and some special functions just for us
    switchTimeVal: function(t) {
	var time_index = this.values[0].indexOf(t);
	this.switchToIndex([time_index, this.height]);
    },
    switchHeight: function(h) {
	this.switchToIndex([this.time, h]);
    },
    loadTime: function(t) {
	var time_index = this.values[0].indexOf(t);
	return this.loadLayer([time_index, this.height]);
    },
});

L.layerSwitcher = function(layers, options) {
    return new L.LayerSwitcher(layers, options);
};


// based on advice here: https://github.com/socib/Leaflet.TimeDimension/issues/19
L.TimeDimension.Layer.LayerSwitcher = L.TimeDimension.Layer.extend({

    initialize: function(layer, options) {
        L.TimeDimension.Layer.prototype.initialize.call(this, layer, options);
        this._currentLoadedTime = 0;
        this._currentTimeData = null;
    },

    onAdd: function(map) {
	// I think this should be edited somehow to start with the
	// correct time
        L.TimeDimension.Layer.prototype.onAdd.call(this, map);
        // if (this._timeDimension) {
        //     this._getDataForTime(this._timeDimension.getCurrentTime());
        // }
	this._update();
    },

    _onNewTimeLoading: function(ev) {
	// ok. Instead of getting data directly, we're going to get
	// the appropriate layer from site.contours, then call
	// loadData on it
        if (!this._map) {
            return;
        }
	// should probably be grabbing data here and firing event on
	// completion (but this is good enough for now)
	var time = ev.time;
	var this2 = this;
	this._baseLayer.loadTime(time).done(function() {
	    this2.fire('timeload', {
		time: time
            });
	});
        return;
    },

    isReady: function(time) {
	return true;
    },

    _update: function() {
	// switch to the appropriate time
        if (!this._map)
            return;
	this._currentLoadedTime = this._timeDimension.getCurrentTime();
	this._baseLayer.switchTimeVal(this._currentLoadedTime);
    }
});

L.timeDimension.layer.layerSwitcher = function(layer, options) {
    return new L.TimeDimension.Layer.LayerSwitcher(layer, options);
};


// extending the geojson time dimension layer to allow backward
// trajectories
L.TimeDimension.Layer.GeoJson2 = L.TimeDimension.Layer.GeoJson.extend({
    initialize: function(layer, options) {
	this.fwd = !!options['fwd'];
        L.TimeDimension.Layer.GeoJson.prototype.initialize.call(this, layer, options);
    },
    _update: function() {
        if (!this._map)
            return;
        if (!this._loaded) {
            return;
        }

        var time = this._timeDimension.getCurrentTime();

	if (this.fwd) {
	    var maxTime = this._timeDimension.getCurrentTime(),
		minTime = 0;
            if (this._duration) {
		var date = new Date(maxTime);
		L.TimeDimension.Util.subtractTimeDuration(date, this._duration, true);
		minTime = date.getTime();
            }
	} else {
	    var minTime = this._timeDimension.getCurrentTime(),
		maxTime = new Date(Math.max.apply(null, this._availableTimes));
	}


        // new coordinates:
        var layer = L.geoJson(null, this._baseLayer.options);
        var layers = this._baseLayer.getLayers();
        for (var i = 0, l = layers.length; i < l; i++) {
            var feature = this._getFeatureBetweenDates(layers[i].feature, minTime, maxTime);
            if (feature) {
                layer.addData(feature);
                if (this._addlastPoint && feature.geometry.type == "LineString") {
                    if (feature.geometry.coordinates.length > 0) {
                        var properties = feature.properties;
                        properties.last = true;
                        layer.addData({
                            type: 'Feature',
                            properties: properties,
                            geometry: {
                                type: 'Point',
                                coordinates: feature.geometry.coordinates[feature.geometry.coordinates.length - 1]
                            }
                        });
                    }
                }
            }
        }

        if (this._currentLayer) {
            this._map.removeLayer(this._currentLayer);
        }
        if (layer.getLayers().length) {
            layer.addTo(this._map);
            this._currentLayer = layer;
        }
    },
    _getFeatureBetweenDates: function(feature, minTime, maxTime) {
        var featureStringTimes = this._getFeatureTimes(feature);
        if (featureStringTimes.length == 0) {
            return feature;
        }
        var featureTimes = [];
        for (var i = 0, l = featureStringTimes.length; i < l; i++) {
            var time = featureStringTimes[i]
            if (typeof time == 'string' || time instanceof String) {
                time = Date.parse(time.trim());
            }
            featureTimes.push(time);
        }
	var index_min = null,
            index_max = null,
            l = featureTimes.length;
	if (this.fwd) {
	    if (featureTimes[0] > maxTime || featureTimes[l - 1] < minTime) {
		return null;
            }
            if (featureTimes[l - 1] > minTime) {
		for (var i = 0; i < l; i++) {
                    if (index_min === null && featureTimes[i] > minTime) {
			// set index_min the first time that current time is greater the minTime
			index_min = i;
                    }
                    if (featureTimes[i] > maxTime) {
			index_max = i;
			break;
                    }
		}
            }
	} else {
	    // the times are backward
	    if (featureTimes[l - 1] > maxTime || featureTimes[0] < minTime) {
		return null;
            }
            if (featureTimes[l - 1] < maxTime) {
		for (var i = 0; i < l; i++) {
                    if (index_min === null && featureTimes[i] <= maxTime) {
			// set index_min the first time that current time is less than the maxTime
			index_min = i;
                    }
                    if (featureTimes[i] < minTime) {
			index_max = i;
			break;
                    }
		}
            }
	}

        if (index_min === null) {
            index_min = 0;
        }
        if (index_max === null) {
            index_max = l;
        }
        var new_coordinates = [];
        if (feature.geometry.coordinates[0].length) {
            new_coordinates = feature.geometry.coordinates.slice(index_min, index_max);
        } else {
            new_coordinates = feature.geometry.coordinates;
        }
        return {
            type: 'Feature',
            properties: feature.properties,
            geometry: {
                type: feature.geometry.type,
                coordinates: new_coordinates
            }
        };
    }
});

L.timeDimension.layer.geoJson2 = function(layer, options) {
    return new L.TimeDimension.Layer.GeoJson2(layer, options);
};

L.TimeDimension.Player = L.TimeDimension.Player.extend({
    setTransitionTime: function(transitionTime) {
        this._transitionTime = transitionTime;
        if (typeof this._buffer === 'function') {
            this._bufferSize = this._buffer.call(this, this._transitionTime, this._minBufferReady, this._loop);
            console.log('Buffer size changed to ' + this._bufferSize);
        } else {
            this._bufferSize = this._buffer;
        }
        if (this._intervalID) {
            this.stop();
            this.start(this._steps);
        }
        this.fire('speedchange', {
            transitionTime: transitionTime,
            buffer: this._bufferSize
        });
    }
});


// and while I'm here...

// an empty layer that turns things off and on
// omg this is pure madness
L.FakeLayer = L.LayerGroup.extend({
    initialize: function(options) {
	this.hysplit = options['hysplit'];
	this.fwd = options['fwd'];
	L.LayerGroup.prototype.initialize.call(this, []);
    },
    onAdd: function() {
	// L.LayerGroup.prototype.addLayer.call(this);
	var cur_fwd = this.hysplit.cur_fwd;
	if (cur_fwd != this.fwd) {
	    this.hysplit.changeSite(this.hysplit.cur_name, this.fwd);
	}
    }
});

L.fakeLayer = function(options) {
    return new L.FakeLayer(options);
};


class Site {
    // this object holds all of the site-specific objects
    constructor(name, fwd, hysplit) {
	this.name = name;
	this.fwd = fwd;
	this._hysplit = hysplit;
	this.contour_layer = this._hysplit.contour_layer;
	this.trajectory_layer = this._hysplit.trajectory_layer;
	// start at time and height = 0
	this.time = 0;
	this.height = 0;
	this.data;
	this.times;
	this.heights;
	// a layerSwitcher layer with contour topojson layers
	this.contours;
	this.trajectories;
	this.getColor = this._hysplit.getColor;
	this.time_slider;
	this.height_slider;
	this.timedim;
	this.td_layer;
    }

    get folder() {
	// get the path to the metadata json for this site
	var fwd_folder;
	if (this.fwd) {
	    fwd_folder = 'fwd/';
	} else {
	    fwd_folder = 'bwd/';
	}
	return 'data/' + this.name + '/' + fwd_folder;
    }

    get meta_path() {
	// get the path to the metadata json for this site
	return this.folder + 'meta.json';
    }

    contour_path(time, height) {
	// get the path to the specified contour json file
	return this.folder + 'height' + height + '_time' + time + '.json';
    }

    highlightFeature(e) {
	var contour = e.target;
	var tooltip_options = {sticky: true};
	var tooltip = L.tooltip(tooltip_options);
	contour.bindTooltip(tooltip).openTooltip();
	contour.setTooltipContent(contour.feature.properties.level_name);
    }

    resetHighlight(e) {
	// pm_layer.resetStyle(e.target);
	// info.update();
    }

    zoomToFeature(e) {
	map.fitBounds(e.target.getBounds());
    }

    onEachFeature(feature, layer) {
	var this2 = this;
	layer.on({
	    mouseover: this2.highlightFeature,
	    mouseout: this2.resetHighlight,
	    click: this2.zoomToFeature
	});
    }

    trajStyle(feature) {
	return {
	    weight: 3,
	    opacity: .6,
	    color: '#5075DB'
	};
    }

    resetTimedim() {
	if (!this._hysplit.timedim) {
	    var start_time;
	    if (this.fwd) {
		start_time = this.times[0];
	    } else {
		start_time = this.times[this.times.length - 1];
	    }
	    var timedim_options = {times: this.times,
				   currentTime: start_time};
	    this._hysplit.timedim = L.timeDimension(timedim_options);
	} else {
	    this._hysplit.timedim.setAvailableTimes(this.times, 'replace');
	}
    }

    loadData() {
	// load the site's metadata, if needed
	if (!!this.data) {
	    // if the data is already loaded
	    return $.when();
	}
	var this2 = this;
	// return this so it can be used as a promise
	return $.get(this.meta_path, function(json) {
	    this2.data = json;
	    this2.times = json['times'].map(function(text) {return new Date(text)});
	    this2.heights = json['heights'];
	    try {
		// get the trajectory if it exists
		var trajectories;
		trajectories = json['trajectories'];
		var trajectory_layer = L.geoJSON(trajectories, {
		    style: this2.trajStyle,
		    onEachFeature: onEachTrajectory,
		    smoothFactor: 1
		});
		var traj_options = {timeDimension: this2._hysplit.timedim,
				    fwd: this2.fwd};
		this2.trajectories = L.timeDimension.layer.geoJson2(trajectory_layer, traj_options);
	    } catch(err) {}
	    var folder = this2.folder;
	    var makeLayer = function(ind) {
		if (ind.some(function(x) {return x < 0})) {
		    throw "Negative index in makeLayer";
		}
		var file = 'height' + ind[1] + '_time' + ind[0] + '.json';
		var contour_path = folder + file;    
		return L.topoJson(null, {
		    style: contourStyle,
		    onEachFeature: function(f, l) {onEachFeature(f, l)},
		    smoothFactor: .5,
		    file_path: contour_path
		});
	    }
	    var ls_options = {values: [this2.times, this2.heights],
			      makeLayer: makeLayer};
	    this2.contours = L.layerSwitcher(ls_options);
	    var td_options = {timeDimension: this2._hysplit.timedim};
	    this2.td_layer = L.timeDimension.layer.layerSwitcher(this2.contours, td_options);
	});
    }

    displayData(time, height) {
	this.contours.switchToIndex([time, parseInt(height)]);
	this.time = time;
	this.height = parseInt(height);
    }

    changeTime(time) {
	this.displayData(time, this.height);
    }

    changeHeight(e, ui) {
	var units;
	var time = this.times.indexOf(this._hysplit.timedim.getCurrentTime());
	var height_index = ui.value;
	this.displayData(time, height_index);
	var height = this.heights[height_index]; // the actual height value, in meters
	if (height > 0) {
	    units = 'ng/m<sup>3</sup>';
	} else {
	    units = 'ng/m<sup>2</sup>';
	}
	$.each($('._units_here'), function(i, x) {x.innerHTML = units});
    };

    makeHeightLabel(h) {
	var heights = this.heights;
    	if (heights[h] == 0) {
    	    return 'Deposition';
	} else if (h == 0) {
	    return '0-' + heights[h] + 'm';
    	} else {
    	    return heights[h - 1] + '-' + heights[h] + 'm';
    	}
    }

    createHeightSlider() {
	this.height_slider = L.control({position: 'bottomleft'});
	var slider = this.height_slider;
	slider.onAdd = function (map) {
	    if (!this._div) {
		// set up the div if it isn't there already
		this._div = L.DomUtil.create('div', 'info vertical-axis');
		var grades = levels,
		    labels = [];
		var range_title = '<h4>Height</h4>'
		var range = '<div id="height_slider2"></div>'
		this._div.innerHTML = range_title + range;
	    }
	    return this._div;
	};
	var map = this._hysplit.map;
	slider.addTo(map);
	// Disable dragging when user's cursor enters the element
	// courtesy of https://gis.stackexchange.com/a/104609
	slider.getContainer().addEventListener('mouseover', function () {
            map.dragging.disable();
	});
	// Re-enable dragging when user's cursor leaves the element
	slider.getContainer().addEventListener('mouseout', function () {
            map.dragging.enable();
	});
	// set up the jquery slider
	var nheights = this.heights.length;
	var slider_options = {max: nheights - 1, orientation: "vertical",
			      slide: this.changeHeight.bind(this),
			      change: this.changeHeight.bind(this)};
	// get the slider labels
	var labels = [];
	for (i = 0; i < nheights; i++) {
	    labels.push(this.makeHeightLabel(i))
	}
	var pip_options = {rest: 'label', labels: labels};
	$('#height_slider2').slider(slider_options).slider("pips", pip_options);
	// set the slider height
	var slider_height = (25 * (nheights - 1)) + 'px';
	$('#height_slider2')[0].style.height = slider_height;
    }

    setup_sliders(map) {
	if (!this.height_slider) {
	    this.createHeightSlider();
	} else {
	    this.height_slider.addTo(map);   
	}
    };

    remove_sliders() {
	try {
	    this.height_slider.remove();	    
	} catch(err) {}
    }

    clearLayers() {
	this.contour_layer.clearLayers();
	this.trajectory_layer.clearLayers();
	this.td_layer.remove();
    }

    addTo(map) {
	this.loadData().done(function() {
	    this.resetTimedim();
	    this.setup_sliders(map);
	    this.contour_layer.addLayer(this.contours);
	    this.trajectory_layer.addLayer(this.trajectories);
	    this.td_layer.addTo(map);
	}.bind(this));
    }

    remove() {
	this.remove_sliders();
	try {
	    this.clearLayers();   
	} catch(err) {}
    }
}

class SiteSelector {
    constructor(sites, start_site_name, origin_layer, hysplit) {
	this._hysplit = hysplit;
	// the layer where the release point is stored for display on
	// the main map
	this.origin_layer = origin_layer;
	// the site markers
	this.marker_layer = L.featureGroup();
	this.start_site = start_site_name;
	this.site_info;
	this.selected;
	this.origin_circle;
	this.common_options = {};
	this.cm_options = {radius: 7, color: '#333',
			   weight: 2, opacity: .6,
			   fillOpacity: .2};
	this.cm_selected_options = {radius: 7, color: 'red',
				    weight: 2, opacity: .6,
				    fillOpacity: .2};
	this.cm_orig_options = {radius: 5, color: '#ff9000',
				weight: 2, fillOpacity: .6};
	this.addSites(sites);
    }

    mouseoverMarker(e) {
	var marker = e.target;
	marker.setStyle({
	    radius: 7,
	    weight: 2,
	    fillOpacity: .6
	});
	this.site_info.update(marker['site_name']);
    }

    mouseoutMarker(e) {
	var marker = e.target;
	marker.setStyle(marker['default_style']);
	this.site_info.update();
    }

    updateStyle(marker, style) {
	marker['default_style'] = style;
	marker.setStyle(style);
    }

    select(marker) {
	var new_site = marker['site_name'];
	// update the selected marker's style
	this.updateStyle(marker, this.cm_selected_options);
	try {
	    // update the previously selected marker's style
	    this.updateStyle(this.selected, this.cm_options);
	} catch(err) {}
	// set this marker as the new selected marker
	this.selected = marker;
	try {
	    // update the info box
	    $('#cur_site')[0].innerHTML = new_site;
	} catch(err) {}
	// update the origin point on the main map
	var lat = marker._latlng.lat;
	var lon = marker._latlng.lng;
	var origin = L.circleMarker([lat, lon]);
	this.updateStyle(origin, this.cm_orig_options)
	origin.on('mouseover', function(e) {this.mouseoverMarker(e)});
	origin.on('mouseout', function (e) {this.mouseoutMarker(e)});
	this.origin_layer.clearLayers();
	this.origin_layer.addLayer(origin);
    }

    clickMarker(e) {
	var marker = e.target;
	this.select(marker);
	var new_site = marker['site_name'];
	var cur_fwd = this._hysplit.cur_site.fwd;
	this._hysplit.changeSite(new_site, cur_fwd);
    }

    addSites(sites) {
	var this2 = this;
	$.each(sites, function(i, site) {
	    var lat = parseFloat(site['lat [degrees]']);
	    var lon = parseFloat(site['lon [degrees]']);
	    var marker;
	    marker = L.circleMarker([lat, lon]);
	    this2.updateStyle(marker, this2.cm_options)
	    marker['site_name'] = site['stid'];
	    marker.on('mouseover', function(e) {this2.mouseoverMarker(e)});
	    marker.on('mouseout', function (e) {this2.mouseoutMarker(e)});
	    marker.on('click', function(e) {this2.clickMarker(e)});
	    if (marker['site_name'] == this2.start_site) {
		this2.select(marker);
	    }
	    this2.marker_layer.addLayer(marker);
	});
    }
    
    addSiteInfo(map) {
	/* site info box in the site locator map */
	var this2 = this;
	var site_info = L.control({position: 'topleft'});
	site_info.onAdd = function (map) {
	    this._div = L.DomUtil.create('div', 'info');
	    this._div.innerHTML = '<h4>Current Site: <span id="cur_site">' +
		this2.start_site + '</span></h4>' +
		'Switch to: <span id="hov_site"></span>';
	    this.update();
	    return this._div;
	};
	site_info.update = function (props) {
	    try {
		$('#hov_site')[0].innerHTML = (props ? props : '');
	    } catch(err) {};
	};
	site_info.addTo(map);
	this.site_info = site_info;
    }

    addTo(map) {
	this.marker_layer.addTo(map);
	this.addSiteInfo(map);
    }
}


class Hysplit {
    constructor(sites_csv, start_site_name, start_site_fwd) {
	this.sites_csv = sites_csv;
	this.contour_layer = L.layerGroup([]);
	this.trajectory_layer = L.layerGroup([]);
	this.origin_layer = L.layerGroup([]);
	this.cur_name = start_site_name;
	this.cur_fwd = start_site_fwd;
	this.cur_site = new Site(this.cur_name, this.cur_fwd, this);
	this.map;
	this.sites;
	this.cached_sites = {};
	this.site_map;
	this.origin_circle;
	this.timedim = L.timeDimension({times: []});
	this.time_slider;
	// make two fakelayers (fwd and bck) to include in the layer controller
	this.fwd_layer = L.fakeLayer({hysplit: this, fwd: true});
	this.bck_layer = L.fakeLayer({hysplit: this, fwd: false});
    }

    get_sites() {
	var this2 = this;
	var site_name;
	return $.get(this.sites_csv, function(csv) {
	    this2.sites = $.csv.toObjects(csv);
	    // set up the cached sites object
	    $.each(this2.sites, function(i, site) {
		site_name = site['stid'];
		this2.cached_sites[site_name] = {};
		this2.cached_sites[site_name][true] = null;
		this2.cached_sites[site_name][false] = null;
	    });
	});
    }

    addTileLayer() {
	L.tileLayer('https://api.tiles.mapbox.com/v4/{id}/{z}/{x}/{y}.png?access_token=pk.eyJ1IjoibWFwYm94IiwiYSI6ImNpejY4NXVycTA2emYycXBndHRqcmZ3N3gifQ.rJcFIG214AriISLbB6B5aw', {
	    maxZoom: 18,
	    attribution: 'Map data &copy; <a href="http://openstreetmap.org">OpenStreetMap</a> contributors, ' +
		'<a href="http://creativecommons.org/licenses/by-sa/2.0/">CC-BY-SA</a>, ' +
		'Imagery © <a href="http://mapbox.com">Mapbox</a>',
	    id: 'mapbox.light'
	}).addTo(this.map);
    }

    getColor(d) {
	return d >= 5  ? '#800000' :
	    d >= 4  ? '#ff3200' :
	    d >= 3  ? '#ffb900' :
	    d >= 2  ? '#b6ff41' :
	    d >= 1  ? '#41ffb6' :
	    d >= 0  ? '#00a4ff' :
	    d >= -1 ? '#0012ff' :
	    '#000080';
    }

    addLegend() {
	var this2 = this;
	var legend = L.control({position: 'bottomright'});
	legend.onAdd = function (map) {
	    var div = L.DomUtil.create('div', 'info legend'),
		/* grades = [0, 10, 20, 50, 100, 200, 500, 1000],*/
		grades = levels,
		labels = [],
		from, to;
	    var legend_title = '<h4>PM Levels</h4>';
	    var units;
	    if (this2.cur_site.heights[this2.cur_site.height] == 0) {
		units = 'ng/m<sup>2</sup>';
	    } else {
		units = 'ng/m<sup>3</sup>';
	    }
	    for (var i = grades.length - 1; i >= 0; i--) {
		from = grades[i];
		to = grades[i + 1];
		labels.push('<i style="background:' + this2.getColor(from) + '"></i> <b>' +
			    '10<sup>' + from + '</sup>' +
			    (i + 1 < grades.length ? '&ndash;10<sup>' + to + '</sup>' : '+') +
			    '</b> <span class="_units_here">' + units + '</span>');
	    }
	    div.innerHTML = legend_title + labels.join('<br>');
	    return div;
	};
	legend.addTo(this.map);
    }

    addSiteSelector() {
	/* 'store' locator div */
	var locator = L.control({position: 'topright'});
	locator.onAdd = function (map) {
	    var div = L.DomUtil.create('div', 'info');
	    var site_div = document.createElement("div");
	    site_div.id = 'locator';
	    div.appendChild(site_div);
	    return div;
	};
	locator.addTo(this.map);

	// add map and background
	var site_map_options = {zoomControl: false,
				attributionControl: false};
	this.site_map = L.map('locator', site_map_options).setView([43, -76], 6);
	L.tileLayer('https://api.tiles.mapbox.com/v4/{id}/{z}/{x}/{y}.png?access_token=pk.eyJ1Ijoic2tlcHRpa29zIiwiYSI6ImNqNWU2NjNhYzAwcDEycWpqdTJtNWJmNGYifQ.kxK-j2hWsX46EhH5PnsTfA', {
	    maxZoom: 18,
	    id: 'mapbox.streets'
	}).addTo(this.site_map);

	// add markers?
	var site_selector = new SiteSelector(this.sites, this.cur_site.name,
					     this.origin_layer, this);
	site_selector.addTo(this.site_map);
    }

    get fwd_str() {
	if (this.cur_fwd) {
	    return 'Forward';
	} else {
	    return 'Backward';
	}
    }

    addSimInfo() {
	/* simulation info box */
	var sim_info = L.control({position: 'topright'});
	sim_info.onAdd = function (map) {
	    this._div = L.DomUtil.create('div', 'info accordion');
	    $(this._div).accordion({
		collapsible: true,
		heightStyle: "content"
	    });
	    var custom_form = '<div><form id="hysplit" onSubmit="run_hysplit(); return false;">' +
		'Latitude: <input type="text" name="lat"><br>' +
		'Longitude: <input type="text" name="lon"><br>' +
		'<input type="submit" value="Click me to run the model"></form></div>';
	    $(this._div).append('<h4>Custom Simulation:</h4>' + custom_form);
	    this.update();
	    return this._div;
	};
	var this2 = this;
	sim_info.update = function (props) {
	    if ($('.accordion h4').length > 1) {
		$('.accordion').children().slice(0,2).remove();
	    }
	    var info_text;
	    info_text = '<h4>Simulation Info:</h4>';
	    if (this2.cur_site) {
		info_text += '<div>Release site: ' + this2.cur_name + '<br>' +
		    'Trajectory: ' + this2.fwd_str + '<br>' +
		    'Latitude: ' + this2.cur_site.data['latitude'] + '&#176; N<br>' +
		    'Longitude: ' + this2.cur_site.data['longitude'] + '&#176; W<br>' +
		    'Release height: ' + this2.cur_site.data['release_height'] + 'm AGL<br>';
		if (this2.cur_fwd) {
		    info_text += 'Release time: ' + this2.cur_site.data["release_time"] + ' UTC<br>' +
			'Release duration: ' + this2.cur_site.data["release_duration"] + ' hour(s)<br></div>';
		} else {
		    info_text += 'Arrival time: ' + this2.cur_site.data["release_time"] + ' UTC<br></div>'
		}	
	    }
	    $(this._div).prepend(info_text);
	    $(this._div).accordion('refresh');
	};
	this.sim_info = sim_info.addTo(this.map);
    }

    addLayerControl() {
	var this2 = this;
	var baseMaps = {
	    'Forward': this2.fwd_layer,
	    'Backward': this2.bck_layer
	}
	var overlayMaps = {
	    'Contours': this2.contour_layer,
	    'Trajectories': this2.trajectory_layer
	}
	L.control.layers(baseMaps, overlayMaps, {position: 'topleft'}).addTo(this.map);
    }

    addTimeSlider() {
	var time_options = {timeDimension: this.timedim, loopButton: true,
			    timeSliderDragUpdate: true,
			    playReverseButton: true};
	this.time_slider = L.control.timeDimension(time_options);
	this.time_slider.addTo(this.map);
    }

    initialize(divid) {
	return this.get_sites().done(function() {
	    var site_name = this.cur_site.name;
	    var site_fwd = this.cur_site.fwd;
	    this.cached_sites[site_name][site_fwd] = this.cur_site;
	    this.map = L.map(divid, {layers: [this.fwd_layer, this.contour_layer, this.trajectory_layer]}).
		setView([43, -74.5], 7);
	    this.addTileLayer();
	    this.addSiteSelector();
	    this.origin_layer.addTo(this.map);
	    this.addLayerControl();
	    this.addTimeSlider();
	    this.cur_site.loadData().done(function() {
		this.cur_site.addTo(this.map);
		this.addLegend();
		this.addSimInfo();
	    }.bind(this));
	}.bind(this));
    }

    update_info() {
	this.sim_info.update();
    }

    changeSite(name, fwd) {
	if (this.cur_name != name || this.cur_fwd != fwd) {
	    this.cur_name = name;
	    this.cur_fwd = fwd;
	    // get the site data
	    var f = function() {
		this.cur_site.remove();
		this.cur_site = this.cached_sites[name][fwd];
		this.cur_site.addTo(this.map);
		// update the simulation info
		this.update_info();
	    }.bind(this);
	    var f_fail = function() {
		this.cur_site.remove();
		this.cur_site = this.cached_sites[name][fwd];
		// not adding anything to the map
		this.update_info();
	    }.bind(this);
	    if (!this.cached_sites[name][fwd]) {
		var site;
		site = new Site(name, fwd, this);
		this.cached_sites[name][fwd] = site;
		site.loadData().done(f).fail(f_fail);
	    } else {
		f();
	    }
	}
    }

    changeFwd() {
	var cur_fwd = this.cur_site.fwd;
	this.changeSite(this.cur_site.name, !this.cur_site.fwd);
    }
}
