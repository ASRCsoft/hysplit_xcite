// functions and classes for HYSPLIT interactive viewer app


// a few functions first

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
	    var topo = this;
	    $.getJSON(this.options.file_path, function(gjson) {
		topo.initialize(gjson, topo.options);
		topo.dataIsLoaded = true;
		return null;
	    });
	};
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


class Site {
    // this object holds all of the site-specific objects
    constructor(name, fwd, hysplit) {
	this.name = name;
	this.fwd = fwd;
	this._hysplit = hysplit;
	// start at time and height = 0
	this.time = 0;
	this.height = 0;
	this.data;
	this.times;
	this.heights;
	// a 2D (times.length x heights.length) array of contour
	// layers
	this.contours;
	// the full geojson trajectory
	this.trajectory;
	// a 1D (times.length) array of trajectory layers
	this.trajectories;
	this.contour_layer = this._hysplit.contour_layer;
	this.trajectory_layer = this._hysplit.trajectory_layer;
	this.getColor = this._hysplit.getColor;
	this.time_slider;
	this.height_slider;
    }

    get folder() {
	// get the path to the metadata json for this site
	var fwd_folder;
	if (this.fwd) {
	    fwd_folder = 'fwd/';
	} else {
	    fwd_folder = 'bck/';
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

    makeContours() {
	this.contours = [];
	var layers;
	var layer;
	var contour_path;
	var this2 = this;
	// can't believe I actually have to define this here. Dumb.
	var contourStyle = function(feature) {
	    return {
		weight: 0,
		opacity: 1,
		color: 'white',
		fillOpacity: 0.5,
		fillColor: this2.getColor(feature.properties.level)
	    };
	}
	for (var i=0; i<this.times.length; i++) {
	    layers = [];
	    // loop through times in the first dimension
	    for (var j=0; j<this.heights.length; j++) {
		// loop through heights in the second dimension
		contour_path = this.contour_path(i, j);
		layer = L.topoJson(null, {
		    style: contourStyle,
		    onEachFeature: function(f, l) {this2.onEachFeature(f, l)},
		    smoothFactor: .5,
		    file_path: contour_path
		});
		layers.push(layer);
	    }
	    this.contours.push(layers);
	}
    }

    trajStyle(feature) {
	return {
	    weight: 3,
	    opacity: .6,
	    color: '#5075DB'
	};
    }

    makeTrajectories() {
	if (!this.trajectory['coordinates']) {
	    // give up if there's no trajectory
	    return null;
	}
	this.trajectories = [];
	var layer;
	var traj_subset;
	var line_coords = this.trajectory['coordinates'];
	for (var t=0; t<this.times.length; t++) {
	    // loop through times
	    traj_subset = {'type': 'LineString'};
	    if (this.fwd) {
		traj_subset['coordinates'] = line_coords.slice(0, parseInt(t) + 2);
	    } else {
		traj_subset['coordinates'] =
		    line_coords.slice(0, line_coords.length - (parseInt(t))).reverse();
	    }
	    layer = L.geoJSON(traj_subset, {
		style: this.trajStyle,
		smoothFactor: 1
	    });
	    this.trajectories.push(layer);
	}
    }

    loadData() {
	// load the site's metadata
	var this2 = this;
	// return this so it can be used as a promise
	return $.get(this.meta_path, function(json) {
	    this2.data = json;
	    this2.times = json['times'].map(function(text) {return new Date(text)});
	    this2.heights = json['heights'];
	    this2.makeContours();
	    try {
		// get the trajectory if it exists
		this2.trajectory = json['trajectory'];
		this2.makeTrajectories();
	    } catch(err) {}
	});
    }

    displayData(time, height) {
	this.contour_layer.clearLayers();
	this.contour_layer.addLayer(this.contours[time][height]);
	this.trajectory_layer.clearLayers();
	if (this.trajectories) {
	    this.trajectory_layer.addLayer(this.trajectories[time]);
	}
	this.time = time;
	this.height = height;
    }

    changeTime(time) {
	this.displayData(time, this.height);
	this.time = time;
    }

    changeHeight(height) {
	this.displayData(this.time, height);
	this.height = height;
    };

    create_time_slider() {
	var times = this.times;
	this.times2 = times;
	var this2 = this;
	this.time_slider = L.control.slider(function(t) {this2.changeTime(t);},
					    {id: 'time_slider', orientation: 'horizontal',
					     title: 'Select Hour', value: 0, min: 0,
					     max: times.length - 1, position: 'bottomleft',
					     logo: 'Time', size: '400px', collapsed: false,
					     getValue: function(time) {return times[time].toLocaleTimeString();},
					     syncSlider: true });
    }

    create_height_slider() {
	var heights = this.heights;
	var this2 = this;
	this.height_slider = L.control.slider(function(h) {this2.changeHeight(h);},
					      {id: 'height_slider', orientation: 'vertical',
					       title: 'Select Height', value: 0,
					       max: heights.length - 1, position: 'bottomleft',
					       logo: 'Height', size: '100px', collapsed: false,
					       getValue: function(height) {return heights[height] + 'm';},
					       syncSlider: true });
    };

    setup_sliders(map) {
	if (!this.time_slider) {
	    this.create_time_slider();
	}
	if (!this.height_slider) {
	    this.create_height_slider();
	}
	this.time_slider.addTo(map);
	this.height_slider.addTo(map);
    };

    remove_sliders() {
	this.time_slider.remove();
	this.height_slider.remove();
    }

    clearLayers() {
	this.contour_layer.clearLayers();
	this.trajectory_layer.clearLayers();
    }

    addTo(map) {
	this.setup_sliders(map);
	this.displayData(this.time, this.height);
    }

    remove() {
	this.remove_sliders();
	this.clearLayers();
    }
}

class SiteSelector {
    constructor(sites, start_site_name) {
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
	    $('#cur_site')[0].innerHTML = marker['site_name'];
	} catch(err) {}
    }

    clickMarker(e) {
	var marker = e.target;
	this.select(marker);
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
	    // marker['default_style'] = this2.cm_options;
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
	this.cur_site = new Site(start_site_name, start_site_fwd, this);
	this.map;
	this.sites;
	this.cached_sites = {};
	this.site_map;
	this.origin_circle;	
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
	    var legend_title = '<h4>PM Levels</h4>'
	    for (var i = grades.length - 1; i >= 0; i--) {
		from = grades[i];
		to = grades[i + 1];
		labels.push('<span id="ng' + from + '">' +
			    '<i style="background:' + this2.getColor(from) + '"></i> <b>' +
			    '10<sup>' + from + '</sup>' +
			    (i + 1 < grades.length ? '&ndash;10<sup>' + to + '</sup>' : '+') +
			    '</b> ng/m<sup>3</sup></span>');
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
	var site_selector = new SiteSelector(this.sites, this.cur_site.name);
	site_selector.addTo(this.site_map);
    }

    addSimInfo() {
	/* simulation info box */
	var sim_info = L.control({position: 'topright'});
	sim_info.onAdd = function (map) {
	    this._div = L.DomUtil.create('div', 'info');
	    this.update();
	    return this._div;
	};
	sim_info.update = function (props) {
	    var custom_form;
	    this._div.innerHTML = '<h4>Simulation Info:</h4>' +
		'<p>Release site: BUFF<br>' +
		'Release time: 10am<br>' +
		'More info about things, etc.</p>';
	    custom_form = '<form id="hysplit" onSubmit="run_hysplit(); return false;">' +
		'Latitude: <input type="text" name="lat"><br>' +
		'Longitude: <input type="text" name="lon"><br>' +
		'<input type="submit" value="Click me to run the model"></form>';
	    this._div.innerHTML += '<h4>Custom Simulation:</h4>' + custom_form;
	};
	sim_info.addTo(this.map);
    }

    initialize(divid) {
	var this2 = this;
	var site_name;
	var site_fwd;
	return this.get_sites().done(function() {
	    site_name = this2.cur_site.name;
	    site_fwd = this2.cur_site.fwd;
	    this2.cached_sites[site_name][site_fwd] = this2.cur_site;
	    this2.map = L.map(divid, {layers: [this2.contour_layer, this2.trajectory_layer]}).
		setView([43, -74.5], 7);
	    this2.addTileLayer();
	    this2.addLegend();
	    this2.addSiteSelector();
	    this2.addSimInfo();
	    this2.cur_site.loadData().done(function() {
		this2.cur_site.addTo(this2.map);
	    });
	});
    }

    changeSite(name, fwd) {
	var this2 = this;
	var site;
	if (!this.cached_sites[name][fwd]) {
	    site = new Site(name, fwd, this);
	    this.cached_sites[name][fwd] = site;
	    site.loadData().done(function() {
		this2.cur_site.remove();
		this2.cur_site = this2.cached_sites[name][fwd];
		this2.cur_site.addTo(this2.map);
	    });
	} else {
	    this.cur_site.remove();
	    this.cur_site = this.cached_sites[name][fwd];
	    this.cur_site.addTo(this.map);
	}
    }
}
