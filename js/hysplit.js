// functions and classes for HYSPLIT interactive viewer app


// a few functions first

getColor = function(d) {
    return d >= 3  ? '#800000' :
	d >= 2  ? '#ff6800' :
	d >= 1  ? '#ceff29' :
	d >= 0  ? '#29ffce' :
	d >= -1 ? '#004cff' :
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

addHeightGraph = function(e) {
    var times = this.feature.properties.times;
    var heights = this.feature.properties.heights;
    // var tooltip = e.tooltip;
    var tooltip = this.getTooltip();
    // make the time series list for metricsgraphics
    var data = [];
    for (var i=0; i<times.length; i++) {
	data.push({'time': new Date(times[i]), 'height': heights[i]});
    }
    // console.log(data);
    MG.data_graphic({
        title: "Trajectory Height",
        // description: "This is a simple line chart. You can remove the area portion by adding area: false to the arguments list.",
        data: data,
	interpolate: d3.curveLinear,
        width: 500,
        height: 200,
	left: 90,
        right: 20,
	area: false,
	utc_time: true,
        target: tooltip._content,
        x_accessor: 'time',
        y_accessor: 'height',
	x_label: 'Time (UTC)',
        y_label: 'Height AGL (m)',
    });
}

highlightTrajectory = function(e) {
    var trajectory = e.target;
    var tooltip_options = {className: 'hysplit_trajectory_tooltip'}
    var tooltip = L.tooltip(tooltip_options);
    // create the height graph when added to map:
    // tooltip.onAdd = addHeightGraph.bind(trajectory);
    trajectory.on('tooltipopen', addHeightGraph.bind(trajectory));
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
    var div = document.createElement('div');
    trajectory.bindTooltip(tooltip).setTooltipContent(div).openTooltip();
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

// helpful classes

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

// fixing a minor bug which occurs when changing transition
// times. See: https://github.com/socib/Leaflet.TimeDimension/pull/110
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

// changing the time format
L.Control.TimeDimension = L.Control.TimeDimension.extend({
    _toggleDateUTC: function() {
        // if (this._dateUTC) {
        //     L.DomUtil.removeClass(this._displayDate, 'utc');
        //     this._displayDate.title = 'Local Time';
        // } else {
        //     L.DomUtil.addClass(this._displayDate, 'utc');
        //     this._displayDate.title = 'UTC Time';
        // }
        // this._dateUTC = !this._dateUTC;
        // this._update();
    },
    _getDisplayDateFormat: function(date) {
	var year = date.getUTCFullYear();
	var month = ("00" + (date.getUTCMonth() + 1)).slice(-2);
	var day = ("00" + date.getUTCDate()).slice(-2);
	var hour = ("00" + date.getUTCHours()).slice(-2);
	// return this._dateUTC ? date.toISOString() : date.toLocaleString();
	return this._dateUTC ? year + '-' + month + '-' + day + ' ' + hour + ':00 UTC' :
	    date.toLocaleString();
    }
});


// A layer containing the contours and trajectories for HYSPLIT and
// coordinating them with the contour_layer and trajectory layers
L.SiteLayer = L.LayerGroup.extend({
    // this object holds all of the site-specific objects
    initialize: function(options) {
	// will need to have: site name, fwd, date, hysplit
	L.LayerGroup.prototype.initialize.call(this, []);
	this.options = options;
	this.name = this.options.name;
	this.fwd = this.options.fwd;
	this.date = this.options.date;
	this._hysplit = this.options.hysplit;
	this.contour_layer = this._hysplit.contour_layer;
	this.ens_trajectory_layer = this._hysplit.ens_trajectory_layer;
	this.single_trajectory_layer = this._hysplit.single_trajectory_layer;
	// start at time and height = 0
	this.time = 0;
	this.height = 0;
	this.data;
	this.times;
	this.heights;
	// a layerArray layer with contour topojson layers
	this.contours;
	// ensemble trajectories
  	this.trajectories;
	// single trajectory
	this.trajectory;
	this.getColor = this._hysplit.getColor;
	this.time_slider;
	this.height_slider;
	this.timedim;
	this.td_layer;
    },
    folder: function() {
	// get the path to the metadata json for this site
	var fwd_folder;
	if (this.fwd) {
	    fwd_folder = 'fwd/';
	} else {
	    fwd_folder = 'bwd/';
	}
	return this._hysplit.hysplit_data_url + '/' + this.date + '_' +
	    this.name + '/' + fwd_folder;
    },
    meta_path: function() {
	// get the path to the metadata json for this site
	return this.folder() + 'meta.json';
    },
    meta_url: function() {
	// get the url for the metadata json for this site
	return 'http://appsvr.asrc.cestm.albany.edu:5000/metadata?site_id=' +
	    this.options['site_id'] + '&time_id=' +
	    this.options['time_id'] + '&fwd=' + this.fwd;
    },
    contour_path: function(time, height) {
	// get the path to the specified contour json file
	return this.folder() + 'height' + height + '_time' + time + '.json';
    },
    highlightFeature: function(e) {
	var contour = e.target;
	var tooltip_options = {sticky: true};
	var tooltip = L.tooltip(tooltip_options);
	contour.bindTooltip(tooltip).openTooltip();
	contour.setTooltipContent(contour.feature.properties.level_name);
    },
    resetHighlight: function(e) {
	// pm_layer.resetStyle(e.target);
	// info.update();
    },
    zoomToFeature: function(e) {
	map.fitBounds(e.target.getBounds());
    },
    onEachFeature: function(feature, layer) {
	var this2 = this;
	layer.on({
	    mouseover: this2.highlightFeature,
	    mouseout: this2.resetHighlight,
	    click: this2.zoomToFeature
	});
    },
    ensTrajStyle: function(feature) {
  	return {
  	    weight: 3,
  	    opacity: .6,
  	    color: '#5075DB'
  	};
    },
    singleTrajStyle: function(feature) {
	return {
	    weight: 3,
	    opacity: .6,
	    color: '#FF0033'
	};
    },
    resetTimedim: function() {
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
	    // this is a bit weird-- when changing the date, also want
	    // to change the time to match the current hours from
	    // release
	    var hysplit = this._hysplit;
	    if (hysplit.cur_site) {
		var cur_hours = hysplit.cur_site.contours.time || 0;
		console.log(cur_hours);
		hysplit.timedim.setAvailableTimes(this.times, 'replace');
		hysplit.timedim.setCurrentTime(this.times[cur_hours]);
	    } else {
		hysplit.timedim.setAvailableTimes(this.times, 'replace');
	    }
	}
    },
    loadData: function() {
	// load the site's metadata, if needed
	if (!!this.data) {
	    // if the data is already loaded
	    return $.when();
	}
	var this2 = this;
	// return this so it can be used as a promise
	return $.getJSON(this.meta_url(), function(results) {
	    this.sim_id = results['id'];
	    var json = results['metadata'];
	    this.data = json;
	    this.times = json['times'].map(function(text) {return new Date(text)});
	    this.heights = json['heights'];
	    try {
		// get the ensemble trajectories if they exist
		var trajectories = json['trajectories'];
		var ens_trajectory_layer = L.geoJSON(trajectories, {
		    style: this.ensTrajStyle,
		    onEachFeature: onEachTrajectory,
		    smoothFactor: 1
		});
		var traj_options = {timeDimension: this._hysplit.timedim,
				    fwd: this.fwd};
		this.trajectories = L.timeDimension.layer.geoJson2(ens_trajectory_layer, traj_options);
	    } catch(err) {}
	    try {
		// get the trajectory if it exists
		var trajectory = json['trajectory'];
		var single_trajectory_layer = L.geoJSON(trajectory, {
		    style: this.singleTrajStyle,
		    onEachFeature: onEachTrajectory,
		    smoothFactor: 1
		});
		var traj_options = {timeDimension: this._hysplit.timedim,
				    fwd: this.fwd};
		this.trajectory = L.timeDimension.layer.geoJson2(single_trajectory_layer, traj_options);
	    } catch(err) {}
	    var folder = this.folder();
	    var makeContours = function(ind) {
		if (ind.some(function(x) {return x < 0})) {
		    throw "Negative index in makeLayer";
		}
		var file = 'height' + ind[1] + '_time' + ind[0] + '.json';
		var contour_path = folder + file;
		var contour_url = 'http://appsvr.asrc.cestm.albany.edu:5000/contours?sim_id=' +
		    this.sim_id + '&height=' + ind[1] +
		    '&time=' + ind[0];
		// return $.getJSON(contour_path).then(function(topojson) {
		return $.getJSON(contour_url).then(function(topojson) {
		    return L.topoJson(topojson, {
			style: contourStyle,
			onEachFeature: function(f, l) {onEachFeature(f, l)},
			smoothFactor: .5,
			file_path: contour_path
		    });
		});
	    }.bind(this);
	    var ls_options = {values: [this.times, this.heights],
			      makeLayer: makeContours};
	    this.contours = L.contourArray(ls_options);
	    var td_options = {timeDimension: this._hysplit.timedim};
	    this.td_layer = L.timeDimension.layer.layerArray(this.contours, td_options);
	}.bind(this));
    },
    displayData: function(time, height) {
	this.contours.switchToIndex([time, parseInt(height)]);
	this.time = time;
	this.height = parseInt(height);
    },
    changeTime: function(time) {
	this.displayData(time, this.height);
    },
    changeHeight: function(e, ui) {
	var units;
	var time = this.times.indexOf(this._hysplit.timedim.getCurrentTime());
	if (time == -1) {
	    throw 'Time not found in changeHeight function.'
	}
	var height_index = ui.value;
	this.displayData(time, height_index);
	var height = this.heights[height_index]; // the actual height value, in meters
	if (height > 0) {
	    units = 'ng/m<sup>3</sup>';
	} else {
	    units = 'ng/m<sup>2</sup>';
	}
	$.each($('._units_here'), function(i, x) {x.innerHTML = units});
    },
    makeHeightLabel: function(h) {
	var heights = this.heights;
    	if (heights[h] == 0) {
    	    return 'Deposition';
	} else if (h == 0) {
	    return '0-' + heights[h] + 'm';
    	} else {
    	    return heights[h - 1] + '-' + heights[h] + 'm';
    	}
    },
    createHeightSlider: function() {
	// make a height slider using the contour layerArray

	// put together some fancy labels first
	var nheights = this.heights.length;
	var labels = [];
	for (i = 0; i < nheights; i++) {
	    labels.push(this.makeHeightLabel(i));
	}
	// make sure this.contours has the current index so that the
	// height slider knows what to switch to
	// this.time = this.times.indexOf(this.timedim.getCurrentTime());
	// this.contours.ind = [this.time, 0];
	var slider_options = {
	    layerArray: this.contours,
	    position: 'bottomleft',
	    orientation: 'vertical',
	    // orientation: 'horizontal',
	    dim: 1, // the height dimension in the layerArray
	    labels: labels,
	    title: 'Height AGL',
	    // length: '50px'
	};
	this.height_slider = L.control.arraySlider(slider_options);
	this.height_slider.addTo(this._hysplit.map);
    },
    setup_sliders: function(map) {
	if (!this.height_slider) {
	    this.createHeightSlider();
	} else {
	    this.height_slider.addTo(map);   
	}
    },
    addContour: function() {
	// var time = this._hysplit.timedim.getCurrentTime();
	this.displayData(this.time, this.height);
    },
    remove_sliders: function() {
	try {
	    this.height_slider.remove();	    
	} catch(err) {}
    },
    clearLayers: function() {
	this.contour_layer.removeLayer(this.contours);
	this.ens_trajectory_layer.removeLayer(this.trajectories);
	this.single_trajectory_layer.removeLayer(this.trajectory);
	this.td_layer.remove();
    },
    onAdd: function(map) {
	this.loadData().done(function() {
	    this.resetTimedim();
	    // now back to the normal stuff
	    this.setup_sliders(map);
	    this.contour_layer.addLayer(this.contours);
	    this.ens_trajectory_layer.addLayer(this.trajectories);
	    this.single_trajectory_layer.addLayer(this.trajectory);
	    this.td_layer.addTo(map);
	    // first check to see if a contour has already been added
	    if (!this.contours.ind) {
		this.addContour();
	    }
	}.bind(this));
    },
    onRemove: function() {
	this.remove_sliders();
	this.clearLayers();
    }
});

L.siteLayer = function(options) {
    return new L.SiteLayer(options);
};

// a siteLayer but with a slightly different path to work with custom
// simulation results
L.CustomSiteLayer = L.SiteLayer.extend({
    meta_url: function() {
	// get the url for the metadata json for this site
	return 'http://appsvr.asrc.cestm.albany.edu:5000/metadata?sim_id=' +
	    this.options['sim_id'];
    },
    folder: function() {
	// get the path to the metadata json for this site
	var fwd_folder;
	if (this.fwd) {
	    fwd_folder = 'fwd/';
	} else {
	    fwd_folder = 'bwd/';
	}
	return '/~xcite/hysplit_xcite/data/' + this.name + '/' + fwd_folder;
    }
});

L.customSiteLayer = function(options) {
    return new L.CustomSiteLayer(options);
};

L.ContourArray = L.LayerArray.extend({
    // some special layerArray functions just for us
    initialize: function(options) {
	L.LayerArray.prototype.initialize.call(this, options);
	this.time = 0;
	this.height = 0;
    },
    setIndex: function(ind) {
	this.ind = ind;
	this.time = ind[0];
	this.height = ind[1];
    },
    switchTimeVal: function(t) {
	var time_index = this.values[0].indexOf(t);
	if (this.time == time_index) {
	    // don't do anything
	    return false;
	}
	if (time_index == -1) {
	    throw 'Time not found in switchTimeVal function.'
	}
	this.switchToIndex([time_index, this.height]);
    },
    switchHeight: function(h) {
	this.switchToIndex([this.time, h]);
    },
    loadTime: function(t) {
	var time_index = this.values[0].indexOf(t);
	if (time_index == -1) {
	    throw 'Time not found in loadTime function.'
	}
	return this.loadLayer([time_index, this.height]);
    },
});

L.contourArray = function(options) {
    return new L.ContourArray(options);
};


function SiteSelector(sites, start_site_name, origin_layer, hysplit) {
    this._hysplit = hysplit;
    // the layer where the release point is stored for display on
    // the main map
    this.origin_layer = origin_layer;
    // the site markers
    this.marker_layer = L.layerGroup();
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

SiteSelector.prototype.mouseoverMarker = function mouseoverMarker(e) {
    var marker = e.target;
    marker.setStyle({
        radius: 7,
        weight: 2,
        fillOpacity: .6
    });
    this.site_info.update(marker['full_name']);
} 

SiteSelector.prototype.mouseoutMarker = function mouseoutMarker(e) {
    var marker = e.target;
    marker.setStyle(marker['default_style']);
    this.site_info.update();
}

SiteSelector.prototype.updateStyle = function updateStyle(marker, style) {
    marker['default_style'] = style;
    marker.setStyle(style);
}

SiteSelector.prototype.select = function select(marker) {
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
        $('#cur_site')[0].innerHTML = marker['full_name'];
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

SiteSelector.prototype.clickMarker = function clickMarker(e) {
    var marker = e.target;
    this.select(marker);
    var new_site = marker['site_name'];
    var cur_fwd = this._hysplit.cur_site.fwd;
    var cur_date = this._hysplit.cur_date;
    $("#_new_site").val(new_site).change();
    // this._hysplit.changeSite(new_site, cur_fwd, cur_date);
}

SiteSelector.prototype.addSites = function addSites(sites) {
    var this2 = this;
    $.each(sites, function(i, site) {
        var lat = parseFloat(site['latitude']);
        var lon = parseFloat(site['longitude']);
        var marker;
        marker = L.circleMarker([lat, lon]);
        this2.updateStyle(marker, this2.cm_options)
        marker['site_name'] = site['stid'];
        marker['full_name'] = site['name'];
        marker.on('mouseover', function(e) {this2.mouseoverMarker(e)});
        marker.on('mouseout', function (e) {this2.mouseoutMarker(e)});
        marker.on('click', function(e) {this2.clickMarker(e)});
        if (marker['site_name'] == this2.start_site) {
    	    this2.select(marker);
        }
        this2.marker_layer.addLayer(marker);
    });
}

SiteSelector.prototype.addSiteInfo = function addSiteInfo(map) {
    /* site info box in the site locator map */ 
    var this2 = this;
    var site_info = L.control({position: 'topleft'});
    site_info.onAdd = function (map) {
        this._div = L.DomUtil.create('div', 'info');
        this._div.innerHTML = 'Switch to: <span id="hov_site"></span>';
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

SiteSelector.prototype.addTo = function addTo(map) {
    this.marker_layer.addTo(map);
    this.addSiteInfo(map);
}


function Hysplit(start_site_name, start_site_fwd, hysplit_data_url, hysplit_ondemand_url) {
    this.hysplit_data_url = hysplit_data_url ? hysplit_data_url : 'http://appsvr.asrc.cestm.albany.edu/~xcite/hysplit_xcite/data';
    this.hysplit_ondemand_url = hysplit_ondemand_url ? hysplit_ondemand_url : 'http://appsvr.asrc.cestm.albany.edu:5000';
    // this.sites = sites;
    this.contour_layer = L.layerGroup([]);
    this.ens_trajectory_layer = L.layerGroup([]);
    this.single_trajectory_layer = L.layerGroup([]);
    this.origin_layer = L.layerGroup([]);
    this.timedim = L.timeDimension({times: []});
    // make two actionLayers (fwd and bck) to include in the layer controller
    // this.fwd_layer = L.actionLayer({hysplit: this, fwd: true});
    // this.bck_layer = L.actionLayer({hysplit: this, fwd: false});
    this.cur_name = start_site_name;
    this.cur_fwd = start_site_fwd;
    this.dates = [];
    this.cur_date;
    // an multidimensional arrayLayer holding all of the site and
    // fwd/bwd combinations
    this.siteArray;
    // custom simulation ids
    this.custom_id = {};
    this.map;
    this.sites;
    this.cached_sites = {};
    this.site_map;
    this.origin_circle;
    this.time_slider;
}

Hysplit.prototype.getSites = function getSites() {
    return $.getJSON('http://appsvr.asrc.cestm.albany.edu:5000/sites', function (json) {
	this.sites = json;
    }.bind(this));
}

Hysplit.prototype.getTimes = function getTimes() {
    return $.getJSON('http://appsvr.asrc.cestm.albany.edu:5000/times', function(json) {
	this.time_json = json;
	this.dates = this.time_json['data'].map(function(x) {return new Date(x[0])});
	this.cur_date = this.dates[0];
    }.bind(this));
}



Hysplit.prototype.addTileLayer = function addTileLayer() {
    L.tileLayer('https://api.tiles.mapbox.com/v4/{id}/{z}/{x}/{y}.png?access_token=pk.eyJ1IjoibWFwYm94IiwiYSI6ImNpejY4NXVycTA2emYycXBndHRqcmZ3N3gifQ.rJcFIG214AriISLbB6B5aw', {
        maxZoom: 18,
        // attribution: 'Map data &copy; <a href="http://openstreetmap.org">OpenStreetMap</a> contributors, ' +
        //     '<a href="http://creativecommons.org/licenses/by-sa/2.0/">CC-BY-SA</a>, ' +
        //     'Imagery Â© <a href="http://mapbox.com">Mapbox</a>',
	attribution: false,
        id: 'mapbox.light'
    }).addTo(this.map);
}

Hysplit.prototype.getColor = function(d) {
    return d >= 3  ? '#800000' :
	d >= 2  ? '#ff6800' :
	d >= 1  ? '#ceff29' :
	d >= 0  ? '#29ffce' :
	d >= -1 ? '#004cff' :
	'#000080';
}

Hysplit.prototype.addLegend = function addLegend() {
    var this2 = this;
    var legend = L.control({position: 'bottomright'});
    var levels = [-2, -1, 0, 1, 2, 3];
    legend.onAdd = function (map) {
        var div = L.DomUtil.create('div', 'info legend'),
            /* grades = [0, 10, 20, 50, 100, 200, 500, 1000],*/
            grades = levels,
            labels = [],
            from, to;
        var units;
        if (this2.cur_site.heights[this2.cur_site.height] == 0) {
            units = 'ng/m<sup>2</sup>';
        } else {
            units = 'ng/m<sup>3</sup>';
        }
	var legend_title = '<h4>Concentration<br>[<span class="_units_here">' + units + '</span>]</h4>';
        for (var i = grades.length - 1; i >= 0; i--) {
            from = grades[i];
            to = grades[i + 1];
            labels.push('<i style="background:' + this2.getColor(from) + '"></i> <b>' +
                        '10<sup>' + from + '</sup>' +
                        (i + 1 < grades.length ? '&ndash;10<sup>' + to + '</sup>' : '+'));
        }
        div.innerHTML = legend_title + labels.join('<br>');
        return div;
    };
    legend.addTo(this.map);
}

Hysplit.prototype.updateOrigin = function updateOrigin(lat, lon) {
    this.origin_layer.getLayers()[0].setLatLng([lat, lon]);
    // var bounds = this.map.getPixelBounds();
    // var size = {x: bounds.max.x - bounds.min.x, y: bounds.max.y - bounds.min.y};
    // var projected = this.map.project([lat, lon]);
    // var offset = {x: size.x / 4, y: size.y / -4};
    // var new_point = {x: projected.x + offset.x, y: projected.y + offset.y};
    // map.panTo(new L.LatLng(lat, lon));
    // this.map.flyTo(this.map.unproject(new_point));
    // this.map.flyTo(this.origin_layer.getLayers()[0]);
    this.map.flyTo([lat, lon]);
}

Hysplit.prototype.addSiteSelector = function addSiteSelector() {
    /* 'store' locator div */
    var info_accordion = $(this.sim_info._div);
    info_accordion.append('<h4>Site Map</h4>');
    var site_div = document.createElement("div");
    site_div.id = 'locator';
    info_accordion.append(site_div);
    // fix the accordion again
    info_accordion.accordion('refresh');
    var site_map_options = {zoomControl: false,
                            attributionControl: false};
    this.site_map = L.map(site_div, site_map_options).setView([42.85, -76.05], 6);
    L.tileLayer('https://api.tiles.mapbox.com/v4/{id}/{z}/{x}/{y}.png?access_token=pk.eyJ1Ijoic2tlcHRpa29zIiwiYSI6ImNqNWU2NjNhYzAwcDEycWpqdTJtNWJmNGYifQ.kxK-j2hWsX46EhH5PnsTfA', {
        maxZoom: 18,
        id: 'mapbox.streets'
    }).addTo(this.site_map);
    // add markers?
    var site_selector = new SiteSelector(this.sites, this.cur_name,
                                         this.origin_layer, this);
    site_selector.addTo(this.site_map);
}

Hysplit.prototype.fwd_str = function fwd_str() {
    if (this.cur_fwd) {
	return 'Forward';
    } else {
	return 'Backward';
    }
}

Hysplit.prototype.customSimForm = function() {
    // organizing the custom simulation form
    var time_options = '<select id="_custom_date">';
    var date;
    var date_str;
    for (i=0; i < this.dates.length; i++) {
	date = this.dates[i];
	date_str = date.getUTCFullYear() + '-' +
	    ("00" + (date.getUTCMonth() + 1)).slice(-2) + '-' +
	    ("00" + date.getUTCDate()).slice(-2) + ' ' +
	    ("00" + date.getUTCHours()).slice(-2) + ':00 UTC';
	time_options += '<option value="' + this.time_json.index[i] + '">' +
	    date_str + '</option>';
    }
    time_options += '</select>';
    var custom_form = '<div><form id="hysplit" onSubmit="return false;">' +
        'Latitude: <input id="userLat" type="text" name="lat"><br>' +
        'Longitude: <input id="userLng" type="text" name="lon"><br>' +
        'Height (m AGL): <input type="text" name="height" value="10"><br>' +
        '<input type="radio" name="fwd" value="true" checked>Forward<br>' +
        '<input type="radio" name="fwd" value="false">Backward<br>' +
	'Release/Reception time: ' + time_options + '<br>' +
        'Simulated hours: <input type="text" name="records" value="10"><br>' +
        '<input type="submit" value="Run HYSPLIT"></form>' +
        '<p id="hysplit_message"></p></div>';
    return '<h4>Custom Simulation</h4>' + custom_form;
}

Hysplit.prototype.runCustomSim = function() {
    var custom_form = $(this.sim_info._container).find('#hysplit');
    $('#hysplit_message').text('');
    // check that the form values are allowable
    // make sure the number of hours is acceptable
    var records = custom_form.find('input[name="records"]').val();
    if (parseInt(records) > 18) {
        $('#hysplit_message').text("Error: Can't simulate more than 18 hours.");
        return false;
    }
    // make sure either forward or backward is checked
    var fwd = custom_form.find("input[name='fwd']:checked").val();
    // old checkbox code:
    // var fwd = custom_form.find('input:checkbox:checked').map(function() {
    //     return $(this).val();
    // }).get();
    var fwd_true = fwd.indexOf('true') > -1;
    var bwd_true = fwd.indexOf('false') > -1;
    if (!fwd_true && !bwd_true) {
        $('#hysplit_message').text("Error: Must select forward or backward.");
        return false;
    }
    // make sure latitude and longitude are acceptable
    var lat = parseFloat(custom_form.find('input[name="lat"]').val());
    var lon = parseFloat(custom_form.find('input[name="lon"]').val());
    if (lat < 40 || lat > 46.5) {
        $('#hysplit_message').text("Error: Latitude must be between 40 and 46.5.");
        return false;
    }
    if (lon < -82.5 || lon > -69.5) {
        $('#hysplit_message').text("Error: Latitude must be between -82.5 and -69.5.");
        return false;
    }
    // check height
    var height = parseFloat(custom_form.find('input[name="height"]').val());
    if (height < 0 || height > 200) {
        $('#hysplit_message').text("Error: Height must be between 0 and 200.");
        return false;
    }
    // get the id of the time
    var time_id = $('#_custom_date').find(":selected").val();
    var url = 'http://appsvr.asrc.cestm.albany.edu:5000/hysplit2?' +
	custom_form.serialize() + '&time_id=' + time_id;

    $('#hysplit_message').text('Running HYSPLIT...');
    this.map.spin(true, {scale: 2.5});
    $.post(url, function(data) {
        // check for errors
        if (data['error']) {
            $('#hysplit_message').text('Error: ' + data['error']);
            // hysplit.map.spin(false);
            // return false;
        } else {
            $('#hysplit_message')[0].innerHTML += ' Done.';
        }
        $('#hysplit_message')[0].innerHTML +=
            '<br>Simulations took ' + data['seconds'] + ' seconds.';
        // get the path to the simulation results
	this.custom_id = data;
        var id = data['id'];
        var fwd_str;
        if (fwd_true) {
            fwd_str = 'fwd';
        } else {
            fwd_str = 'bwd';
        }
        var data_dir = this.webdata_root + '/' + id + '/' + (fwd_true && bwd_true ? '' : fwd_str);
        //$('#hysplit_message')[0].innerHTML +=
        //  '<br>View raw data <a href="' + data_dir + '" target="_blank">here<a>.';
        // add the site id to the hysplit site cache
        this.cached_sites[id] = {};
        this.cached_sites[id][fwd_true] = null;
        this.changeSite('Custom', fwd_true, this.cur_date, true);
        this.map.spin(false);
    }.bind(this), 'json');
}

Hysplit.prototype.simInfoStart = function() {
    // organizing the simulation info
    var info_text = '<h4>Simulation Info</h4>';
    var fwd_options = '<select id="_new_fwd">' +
	'<option value="true">Forward</option>' +
	'<option value="false">Backward</option></select>';
    var time_options = '<select id="_new_date">';
    var date;
    var date_str;
    for (i=0; i < this.dates.length; i++) {
	date = this.dates[i];
	date_str = date.getUTCFullYear() + '-' +
	    ("00" + (date.getUTCMonth() + 1)).slice(-2) + '-' +
	    ("00" + date.getUTCDate()).slice(-2) + ' ' +
	    ("00" + date.getUTCHours()).slice(-2) + ':00 UTC';
	time_options += '<option value="' + date.toISOString() + '">' +
	    date_str + '</option>';
    }
    time_options += '</select>';
    var site;
    var site_options = '<select id="_new_site">';
    for (i=0; i < this.sites.length; i++) {
	site = this.sites[i];
	site_options += '<option value="' + site['stid'] + '">' +
	    site['name'] + '</option>';
    }
    site_options += '</select>';
    info_text += '<div><label>Direction:</label> ' + fwd_options + '<br>' +
	'Release site: ' + site_options + '<br>' +
        'Latitude: <span id="hysplit_latitude"></span>&#176; N<br>' +
        'Longitude: <span id="hysplit_longitude"></span>&#176; W<br>' +
	'<span id="hysplit_receptor">Release</span> height: <span id="hysplit_height"></span>m AGL<br>' +
        '<span id="hysplit_reception">Release</span> time: ' + time_options + '<br>' +
        '<span id="hysplit_duration_text"><span id="hysplit_reception">Release</span> duration: <span id="hysplit_duration"></span> hour(s)<br></span></div>';
    return info_text;
}

Hysplit.prototype.updateSimInfo = function() {
    // updating the simulation info
    var info_div = $(this.sim_info._div);
    info_div.find('#hysplit_site').text(this.cur_name);
    info_div.find('#hysplit_latitude').text(this.cur_site.data['latitude']);
    info_div.find('#hysplit_longitude').text(this.cur_site.data['longitude']);
    info_div.find('#hysplit_height').text(this.cur_site.data['release_height']);
    info_div.find('#hysplit_time').text(this.cur_site.data["release_time"]);
    info_div.find('#hysplit_receptor').text(this.cur_fwd ? 'Release' : 'Receptor');
    info_div.find('#hysplit_reception').text(this.cur_fwd ? 'Release' : 'Reception');
    info_div.find('#hysplit_duration').text(this.cur_site.data['release_duration']);
    info_div.find('#hysplit_duration_text').css('visibility', this.cur_fwd ? 'visible' : 'hidden');
}
     
Hysplit.prototype.addSimInfo = function() {
    /* simulation info box */  

    this.sim_info = L.control({position: 'topright'});
    var hysplit = this;
    this.sim_info.onAdd = function (map) { 
        this._div = L.DomUtil.create('div', 'info accordion');
        // Disable clicking when user's cursor is on the info box
        // (because we need to keep the lat/lon from earlier mouse
        // clicks!)
        L.DomEvent.disableClickPropagation(this._div);
        $(this._div).accordion({
            collapsible: true,
            heightStyle: "content",
            active: false,
	    activate: function() {hysplit.site_map.invalidateSize()}
        });
	$(this._div).append(hysplit.simInfoStart());
	// fix the current site
	$(this._div).find('#_new_site').val(hysplit.cur_name);
	// add the control functions to the dropdown lists
	$(this._div).find('#_new_fwd').change(function() {
	    var new_fwd = $(this).find(":selected").val() == 'true';
	    hysplit.changeFwd(new_fwd);
	});
	$(this._div).find('#_new_date').change(function() {
	    var new_date = new Date($(this).find(":selected").text());
	    hysplit.changeDate(new_date);
	});
	$(this._div).find('#_new_site').change(function() {
	    var new_site = $(this).find(":selected").val();
	    hysplit.switchSite(new_site);
	});
        $(this._div).append(hysplit.customSimForm());
        // set up the call to the flask server
	var hysplit_form = $(this._div).find('#hysplit');
        hysplit_form.submit(hysplit.runCustomSim.bind(hysplit));
	
	// add the site map
	hysplit.addSiteSelector();
	
	$(this._div).accordion();
        this.update();
        return this._div;
    };
    this.sim_info.update = this.updateSimInfo.bind(this);
    this.sim_info.addTo(this.map);
    $(this.sim_info._container).accordion('refresh')
    // set up the lat/lon action
    this.map.on('click', function(e) {
        var latlng = e.latlng;
        var lat = latlng.lat;
        var lon = latlng.lng;
        document.querySelector('#userLat').value = lat;
        document.querySelector('#userLng').value = lon;
    }); 
}

Hysplit.prototype.addLayerControl = function() {
    var this2 = this;
    var overlayMaps = {
        'Concentration': this2.contour_layer,
        'Ensemble Trajectories': this2.ens_trajectory_layer,
        'Single Trajectory': this2.single_trajectory_layer
    }
    L.control.layers(null, overlayMaps, {position: 'topleft'}).addTo(this.map);
}

Hysplit.prototype.addTimeSlider = function addTimeSlider() {
    var time_options = {timeDimension: this.timedim, loopButton: true,
			// timeSlider: false, speedSlider: false,
			// minSpeed: 4,
                        timeSliderDragUpdate: true,
                        playReverseButton: true};
    this.time_slider = L.control.timeDimension(time_options);
    this.time_slider.addTo(this.map);
}

Hysplit.prototype.initialize = function initialize(divid) {
    var ajax_sites = this.getSites();
    var ajax_times = this.getTimes();
    $.when(ajax_sites, ajax_times).done(function() {
	var site_name = this.cur_name;
	var site_fwd = this.cur_fwd;
	// get all the site names
	var fwd_values = [true, false];
	var dates;
	var makeSite = function(ind) {
	    var date = this.dates[ind[2]];
	    var time_id = this.time_json['index'][ind[2]];
	    // console.log(date);
	    // console.log(time_id);
	    var date_str = date.getUTCFullYear() +
		("00" + (date.getUTCMonth() + 1)).slice(-2) +
		("00" + date.getUTCDate()).slice(-2) + '_' +
		("00" + date.getUTCHours()).slice(-2) + 'z';
	    var site_name = this.sites[ind[0]]['stid'];
	    var site_id = this.sites[ind[0]]['id'];
	    // console.log(site_name);
	    // console.log(site_id);
	    var site_options = {name: site_name,
				site_id: site_id,
				fwd: fwd_values[ind[1]],
				date: date_str,
				time_id: time_id,
				hysplit: this};
	    var site = L.siteLayer(site_options);
	    return site.loadData().then(function() {return site});
	}.bind(this);
	// the dimension values of the 3-dimensional siteArray
	var site_names = this.sites.map(function(x) {return x['stid']})
	var site_dim_values = [site_names, [true, false], this.dates];
	var siteArray_options = {values: site_dim_values,
				 makeLayer: makeSite};
	this.siteArray = L.layerArray(siteArray_options);
	this.map = L.map(divid, {layers: [this.contour_layer]}).
	    setView([43, -74.5], 7);
	this.addTileLayer();
	// this.addSiteSelector();
	this.origin_layer.addTo(this.map);
	this.addLayerControl();
	this.addTimeSlider();
	this.siteArray.addTo(this.map);
	// console.log(this.siteArray.values);
	this.changeSite(this.cur_name, this.cur_fwd, this.cur_date).done(function() {
	    this.addLegend();
	}.bind(this));
    }.bind(this));
}

Hysplit.prototype.update_info = function update_info() {
    if (this.sim_info) {
	this.sim_info.update();
    } else {
	this.addSimInfo();
    }
}

Hysplit.prototype.changeSite = function changeSite(name, fwd, date, custom=false) {
    // in case custom results are currently being shown
    if (this.custom) {
	this.cur_site.remove();
	this.custom = false;
    }
    if (custom) {
	// if custom, get the results manually
	var fwd_str = fwd ? 'fwd' : 'bwd';
	var site_options = {name: 'Custom',
			    sim_id: this.custom_id[fwd_str],
			    fwd: fwd,
			    date: date,
			    hysplit: this};
	var results = L.customSiteLayer(site_options);
	results.loadData().done(function() {
	    // remove the current layer
	    this.siteArray.clearLayers();
	    this.cur_site = results;
	    this.cur_site.addTo(this.map);
	    this.cur_name = this.cur_site.name;
	    this.cur_fwd = this.cur_site.fwd;
	    this.updateOrigin(results.data['latitude'], results.data['longitude'])
	    this.custom = true;
	    this.update_info();
	}.bind(this));
    } else {
	// in case it's not currently displayed
	this.siteArray.addTo(this.map);
	this.cur_name = name;
	this.cur_fwd = fwd;
	this.cur_date = date;
	// let the siteArray do the switching
	var vals = [name, fwd, date];
	return this.siteArray.switchToValue(vals).done(function() {
	    this.cur_site = this.siteArray.cache[this.siteArray.valToArrayInd(vals)];
	    this.update_info();
	    this.updateOrigin(this.cur_site.data['latitude'],
			      this.cur_site.data['longitude'])
	}.bind(this));
    }
}

Hysplit.prototype.switchSite = function(stid) {
    this.changeSite(stid, this.cur_fwd, this.cur_date, this.custom);
}

Hysplit.prototype.changeFwd = function changeFwd(fwd) {
    var new_fwd = fwd || !this.cur_fwd;
    this.changeSite(this.cur_name, new_fwd, this.cur_date, this.custom);
}

Hysplit.prototype.changeDate = function changeDate(date) {
    this.changeSite(this.cur_name, this.cur_fwd, date)
}
