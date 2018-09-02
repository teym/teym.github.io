AFRAME.registerComponent('event-proxy', {
    multiple: true,
    schema: {
        events: {
            type: 'array'
        },
        map: {
            type: 'array'
        },
        target: {
            type: 'selector'
        }
    },
    init: function () {
        var self = this;
        self.onEvent = function (e) {
            self.data.target.emit(self.map[e.type], e.detail, false);
        };
    },

    update: function (oldData) {
        var self = this;
        (oldData.events || []).forEach(e => {
            self.el.removeEventListener(e, self.onEvent);
        });

        self.map = {};
        for (let index = 0; index < (self.data.events || []).length; index++) {
            const a = self.data.events[index];
            const b = self.data.map[index] || a;
            self.map[a] = b;
        }

        (self.data.events || []).forEach(e => {
            self.el.addEventListener(e, self.onEvent);
        });
    },

    remove: function () {
        var self = this;
        (self.data.events || []).forEach(e => {
            self.el.removeEventListener(e, self.onEvent);
        });
    }
});

AFRAME.registerComponent('plane-detector', {
    schema: {
        multiple: {
            type: 'bool',
            default: true
        },
        container: {
            type: 'selector'
        }
    },
    planeShap: function (anchor) {
        // Create the temp objects we will use when updating.
        var tempPosition = new THREE.Vector3();
        var tempQuaternion = new THREE.Quaternion();
        var tempEuler = new THREE.Euler(0, 0, 0, 'YXZ');
        var tempRotation = new THREE.Vector3();
        var tempGeometry = new THREE.Vector3();

        // Update the plane.
        var dx = anchor.extent[0];
        var dz = anchor.extent[1];

        var tempMat4 = new THREE.Matrix4();
        var tempScale = new THREE.Vector3();

        tempMat4.fromArray(anchor.modelMatrix);
        tempMat4.decompose(tempPosition, tempQuaternion, tempScale);
        tempEuler.setFromQuaternion(tempQuaternion);
        tempRotation.set(
            tempEuler.x * THREE.Math.RAD2DEG,
            tempEuler.y * THREE.Math.RAD2DEG,
            tempEuler.z * THREE.Math.RAD2DEG
        );
        // Currently, scale is always 1... 
        // plane.setAttribute('scale', evt.detail.scale);

        // If we have vertices, use polygon geometry
        // if (anchor.vertices) {
        // anchor.vertices works for latest ARKit but not for latest ARCore; Float32Array issue?
        // tempGeometry = { primitive: 'polygon', vertices: anchor.vertices.join(',') };
        // } else {
        tempGeometry.set(dx, 0.001, dz);// = 'primitive:box; width:' + dx + '; height:0.001; depth:' + dz;
        // }
        return {
            attributes: { position: tempPosition, rotation: tempRotation, geometry: 'primitive:box; width:' + dx + '; height:0.001; depth:' + dz },
            box: tempGeometry
        };
    },
    init: function () {
        var self = this;
        self.onClick = function (identifier, shape) {
            console.log('on plane', identifier);
            var planes = self.data.container.querySelectorAll('.plane');
            for (const plane of planes) {
                plane.parentEl && plane.parentEl.remove(plane);
            }
            self.plane = { identifier, shape };
            self.el.emit('on-plane', shape);
        };
        self.onAddPlane = function (ctx) {
            if (self.plane) return;
            console.log('on add plane', ctx.detail.anchors);

            ctx.detail.anchors.forEach(anchor => {
                var identifier = anchor.identifier;
                var plane = document.createElement('a-entity');
                plane.setAttribute('id', 'plane' + identifier);
                plane.setAttribute('class', 'plane');
                plane.setAttribute('material', 'opacity:0.5; color:blue');

                var { attributes, box } = self.planeShap(anchor);
                for (const key in attributes) {
                    if (attributes.hasOwnProperty(key)) {
                        plane.setAttribute(key, attributes[key]);
                    }
                }

                plane.addEventListener('click', function () {
                    const plane = self.data.container.querySelector('#plane' + identifier);
                    const position = plane.object3D.getWorldPosition(new THREE.Vector3());
                    self.onClick(identifier, { position: position, geometry: box });
                });

                self.data.container.appendChild(plane);
            });
            self.plane = null;
        };
        self.onUpdatePlane = function (ctx) {
            if (self.plane) return;
            console.log('on update plane', ctx.detail.anchors);
            ctx.detail.anchors.forEach(function (anchor) {
                var plane = self.data.container.querySelector('#plane' + anchor.identifier);
                if (!plane) return;
                var { attributes, shape } = self.planeShap(anchor);
                for (const key in attributes) {
                    if (attributes.hasOwnProperty(key)) {
                        plane.setAttribute(key, attributes[key]);
                    }
                }
            });
        };
        self.onRemovedPlane = function (ctx) {
            console.log('on remove plane', ctx.detail.anchors);
            ctx.detail.anchors.forEach(function (anchor) {
                var plane = self.data.container.querySelector('#plane' + anchor.identifier);
                if (plane && plane.parentElement) {
                    plane.parentElement.removeChild(plane);
                }
            });
        };
    },

    update: function () {
        var sc = this.el;
        if (!(sc === this.sc) && this.el.components.ar) {
            if (this.sc) {
                this.sc.removeEventListener('anchorsadded', this.onAddPlane);
                this.sc.removeEventListener('anchorsupdated', this.onUpdatePlane);
                this.sc.removeEventListener('anchorsremoved', this.onRemovedPlane);
            }
            this.sc = sc;
            this.sc.addEventListener('anchorsadded', this.onAddPlane);
            this.sc.addEventListener('anchorsupdated', this.onUpdatePlane);
            this.sc.addEventListener('anchorsremoved', this.onRemovedPlane);
        }
    },

    remove: function () {
        this.sc.removeEventListener('anchorsadded', this.onAddPlane);
        this.sc.removeEventListener('anchorsupdated', this.onUpdatePlane);
        this.sc.removeEventListener('anchorsremoved', this.onRemovedPlane);
        this.stop();
    },

    tick: function (time, delta) {
    },

    play: function () {
        this.playing = true;
    },

    stop: function () {
        this.playing = false;
    }
});

AFRAME.registerComponent('on-plane', {
    schema: {
    },
    init: function () {
        var self = this;
        self.onPlane = (e) => {
            const { position, geometry } = e.detail;
            const object3D = self.el.object3D;
            var bbox = (new THREE.Box3().setFromObject(object3D)).getSize(new THREE.Vector3());
            const radius = Math.max(bbox.x, bbox.y, bbox.z) / 2;
            const size = Math.min(geometry.x, geometry.z, radius) / 2;
            const scale = size / radius;
            const pos = object3D.parent.worldToLocal(position);
            object3D.position.set(pos.x, pos.y + size, pos.z);
            object3D.scale.set(scale, scale, scale);
            console.log('on plane', position, geometry, object3D.position, object3D.scale);
        };
        self.el.addEventListener('on-plane', self.onPlane);
    },

    remove: function () {
        this.el.removeEventListener('on-plane', self.onPlane);
    }
});