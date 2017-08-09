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
	this.time = 0;
	this.height = 0;
	// and array of boolean values to keep from loading previously
	// loaded data
	this.isLoaded;
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
	this.isLoaded = new Array(arr_len);
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
	var arr_ind = this.indToArrayInd(ind);
	if (!this.isLoaded[arr_ind]) {
	    this.isLoaded[arr_ind] = true;
	    return this.makeLayer(ind, this.cache, arr_ind);
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
    addIndex: function(ind) {
	this.loadLayer(ind).done(function() {
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
	this.switchToIndex(ind);
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
    }
});

L.layerArray = function(layers, options) {
    return new L.LayerArray(layers, options);
};


// based on advice here: https://github.com/socib/Leaflet.TimeDimension/issues/19
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
	var current_time = this._timeDimension.getCurrentTime();
	if (this._currentLoadedTime != current_time) {
	    this._currentLoadedTime = current_time;
	    this._baseLayer.switchTimeVal(this._currentLoadedTime);
	}
    }
});

L.timeDimension.layer.layerArray = function(layer, options) {
    return new L.TimeDimension.Layer.LayerArray(layer, options);
};
