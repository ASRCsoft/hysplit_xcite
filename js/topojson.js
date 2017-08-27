// leaflet classes for topojson-based layers

L.TopoJSON = L.GeoJSON.extend({
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
    }
});

L.topoJson = function (data, options) {
    return new L.TopoJSON(data, options);
};
// courtesy of Brendan Vinson:
// https://gist.github.com/brendanvinson/0e3c3c86d96863f1c33f55454705bca7
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




// a lazy-loading version (not currently in use)
L.LazyTopoJSON = L.TopoJSON.extend({
    // A lazy-loading topojson layer for leaflet. Cool right?
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

L.lazyTopoJson = function (data, options) {
    return new L.LazyTopoJSON(data, options);
};
