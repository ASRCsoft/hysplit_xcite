// a leaflet layer that conveniently organizes multidimensional arrays
// of layers

// also a timedimension layer that works with the layerArray

L.LayerArray = L.LayerGroup.extend({
    cache: [],
    values: [],
    initialize: function(options) {
	L.LayerGroup.prototype.initialize.call(this, []);
	this.values = options['values'];
	this.lazy = options['lazy'] || true;
	this.dims = this.values.map(function(x) {return x.length});
	this.ndim = this.dims.length;
	this.ind;
	// and array of boolean values to keep from loading previously
	// loaded data
	this.isLoaded;
	this.setupCache();
	// this should be a function that takes an index array and
	// returns a promise that resolves to the corresponding layer
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
	this.isLoaded = new Array(arr_len);
	this.promiseCache = new Array(arr_len);
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
    addToCache: function(ind) {
	var arr_ind = this.indToArrayInd(ind);
	this.promiseCache[arr_ind] = this.makeLayer(ind);
	var f = function(x) {
	    this.cache[arr_ind] = x;
	}.bind(this);
	return this.promiseCache[arr_ind].then(f);
    },
    loadLayer: function(ind) {
	var arr_ind = this.indToArrayInd(ind);
	if (!this.isLoaded[arr_ind]) {
	    this.isLoaded[arr_ind] = true;
	    return this.addToCache(ind);
	} else {
	    return $.when();
	}
    },
    setIndex: function(ind) {
	this.ind = ind;
    },
    getValueIndex: function(val) {
	var ind = [];
	var is_date;
	for (i = 0; i < this.ndim; i++) {
	    // check if the dimension is a date dimension
	    is_date = this.values[i][0] instanceof Date;
	    if (is_date) {
		ind[i] = this.values[i].map(Number).indexOf(+val[i]);
	    } else if (this.values[i][0] instanceof Object) {
		throw "LayerArray can't get index of object values (except dates)";
	    } else {
		ind[i] = this.values[i].indexOf(val[i]);	
	    }
	    if (ind[i] == -1) {
		throw 'Value ' + val[i] + ' not found in array dimension ' + i;
	    }
	}
	return ind;
    },
    addIndex: function(ind) {
	return this.loadLayer(ind).done(function() {
	    this.addLayer(this.cache[this.indToArrayInd(ind)]);	    
	}.bind(this));
    },
    addValue: function(val) {
	var ind = this.getValueIndex(val);
	this.addIndex(ind);
    },
    removeIndex: function(ind) {
	this.removeLayer(this.cache[this.indToArrayInd(ind)]);
    },
    removeValue: function(val) {
	this.removeLayer(this.cache[this.valToArrayInd(val)]);
    },
    switchToValue: function(val) {
	var ind = this.getValueIndex(val);
	return this.switchToIndex(ind);
    },
    switchToIndex: function(ind) {
	this.clearLayers();
	this.setIndex(ind);
	return this.addIndex(ind);
    },
    switchDim: function(dim, ind) {
	// make a copy of the current index
	var new_ind = [];
	for (i=0; i<this.values.length; i++) {
	    new_ind[i] = this.ind[i];
	}
	// update it
	new_ind[dim] = ind;
	// switch to it
	this.switchToIndex(new_ind);
    },
    makeSlider: function(dim, orientation) {
	var slider_options = {layerArray: this, dim: dim,
			      orientation: orientation ? orientation : 'vertical'};
	return L.control.arraySlider(slider_options);
    }
});

L.layerArray = function(options) {
    return new L.LayerArray(options);
};



L.Control.ArraySlider = L.Control.extend({
    // this is going to have the dimension number and layerarray object
    onAdd: function() {
	var layerArray = this.options.layerArray;
	var dim = this.options.dim || 0;
	var labels = this.options.labels || layerArray.values[dim];
	var dim_length = labels.length;
	var orientation = this.options.orientation || 'horizontal';
	var is_vertical = orientation == 'vertical';
	var title = this.options.title || '';
	var slider_length = this.options.length || (25 * (dim_length - 1)) + 'px';
	// set up the div if it isn't there already
	if (is_vertical) {
	    this._div = L.DomUtil.create('div', 'info slider-axis vertical-axis');
	} else {
	    this._div = L.DomUtil.create('div', 'info slider-axis');
	}
	// var grades = levels,
	//     labels = [];
	var range_title = '<h4>' + title + '</h4>'
	var range = '<div id="height_slider2"></div>'
	this._div.innerHTML = range_title + range;
	var slider = $(this._div).find('div')[0];
	var switch_fn = function(e, ui) {
	    this.switchDim(dim, ui.value);
	}.bind(layerArray);

	// set up the jquery slider
	var slider_options = {max: dim_length - 1, orientation: orientation,
			      slide: switch_fn, change: switch_fn};

	// get the slider labels
	var pip_options = {rest: 'label', labels: labels};
	$(slider).slider(slider_options).slider("pips", pip_options);
	if (is_vertical) {
	    // set the slider height
	    $(slider)[0].style.height = slider_length;
	} else {
	    // set the slider width
	    $(slider)[0].style.width = slider_length;
	}

	// Disable dragging when user's cursor enters the element
	// courtesy of https://gis.stackexchange.com/a/104609
	this._div.addEventListener('mouseover', function (e) {
            this._map.dragging.disable();
	}.bind(this));
	// Re-enable dragging when user's cursor leaves the element
	this._div.addEventListener('mouseout', function (e) {
            this._map.dragging.enable();
	}.bind(this));
	
	return this._div;
    }
})

L.control.arraySlider = function(options) {
    return new L.Control.ArraySlider(options);
};


// A layerArray-compatible timedimension layer (from
// leaflet.timedimension). Based on advice here:
// https://github.com/socib/Leaflet.TimeDimension/issues/19
L.TimeDimension.Layer.LayerArray = L.TimeDimension.Layer.extend({

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
	this._baseLayer.loadTime(time).done(function() {
	    this.fire('timeload', {
		time: time
            });
	}.bind(this));
        return;
    },

    isReady: function(time) {
	return true;
    },

    _update: function() {
	// switch to the appropriate time
        if (!this._map)
            return;
	var current_time = this._timeDimension.getCurrentTime();
	if (this._currentLoadedTime != current_time) {
	    this._currentLoadedTime = current_time;
	}
	this._baseLayer.switchTimeVal(this._currentLoadedTime);
    }
});

L.timeDimension.layer.layerArray = function(layer, options) {
    return new L.TimeDimension.Layer.LayerArray(layer, options);
};
