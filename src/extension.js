const Clutter = imports.gi.Clutter;
const FileUtils = imports.misc.fileUtils;
const Gettext = imports.gettext;
const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const Gtk = imports.gi.Gtk;
const Lang = imports.lang;
const Mainloop = imports.mainloop;
const Main = imports.ui.main;
const Panel = imports.ui.panel;
const Pango = imports.gi.Pango;
const Params = imports.misc.params;
const Shell = imports.gi.Shell;
const Signals = imports.signals;
const Soup = imports.gi.Soup;
const St = imports.gi.St;
const Tweener = imports.ui.tweener;

const DIRECTORIES = ["/usr/share/backgrounds",
                     GLib.get_home_dir() + "/Pictures"];

const THUMBNAIL_WIDTH = 300;
const THUMBNAIL_HEIGHT = 190;

const CELL_WIDTH = 310;
const CELL_HEIGHT = 190;

const SET_BACKGROUND_SCHEMA = "org.gnome.desktop.background";
const SET_BACKGROUND_KEY = "picture-uri";
const SPINNER_ANIMATION_TIME = 0.2;

const _  = Gettext.gettext;
const _d = function(msg) {
    global.logError("Wallpapers -> " + msg);
}

String.prototype.isImage = function() {
    let upper = this.toUpperCase();
    var endsWith = function(s) {
        return upper.length >= s.length && upper.substr(upper.length - s.length) == s;
    }

    return endsWith("JPG") || endsWith("PNG") || endsWith("JPEG");
}

/**
 * Image provider
 */
function ImageProvider() {
    this._init(this, arguments);
}

ImageProvider.prototype = {
    _init: function() {
        this._images = [];
    },
    search: function() {
    },
    addImage: function(name, thumbnail_path, complete_path) {
        this._images.push({
            name: name,
            thumbnail_path: thumbnail_path,
            complete_path: complete_path
        });
    },
    images: function() {
        return this._images;
    }
}

/**
 * Local implementation of imageprovider
 * to search for images in local file system ( const DIRECTORIES )
 */
function LocalProvider() {
    this._init(this, arguments);
}

LocalProvider.prototype = {
    __proto__: ImageProvider.prototype,

    _init: function() {
        ImageProvider.prototype._init.call(this);
    },
    search: function() {
        var dirs = DIRECTORIES;

        let i = 0;
        let obj = this;

        for ( i = 0; i < dirs.length; i++ ) {
            let dir = dirs[i];
            let lastDir = ( i == dirs.length - 1) ;

            FileUtils.listDirAsync(Gio.file_new_for_path(dir), function(files) {
                for (let x = 0; x < files.length; x++) {
                    let name = files[x].get_name();
                    if (name.isImage()) {
                        obj.addImage(name, "file://" + dir + "/" + name,
                                           "file://" + dir + "/" + name);
                    }
                }
                if (lastDir) {
                    obj.emit("search_images_done");
                }
            });
        }
/**
            let wallsDir = Gio.file_new_for_path(dir);
            if (wallsDir.query_exists(null)) {
                let children = wallsDir.enumerate_children('standard::name',
                                  Gio.FileQueryInfoFlags.NONE, null);
                let file = null;
                while (( file = children.next_file(null) ) != null ) {
                    let name = file.get_name();
                    if (name.isImage()) {
                        this.addImage(name, "file://" + dir + "/" + name,
                                            "file://" + dir + "/" + name);
                    }
                }

            }
        }
        obj.emit('search_images_done');
**/
    }
}

/**
 * ImageProvider to search for images on deviantart.com
 */
function DeviantArtProvider() {
    this._init(this, arguments);
}

DeviantArtProvider.prototype = {
    __proto__: ImageProvider.prototype,

    _init: function() {
        ImageProvider.prototype._init.call(this);

        let url = "http://backend.deviantart.com/rss.xml?q=boost%3Apopular+in%3Acustomization%2Fwallpaper&type=deviation";
        default xml namespace = "http://www.w3.org/1999/xhtml";
        this.session = new Soup.SessionAsync();
        this.message = Soup.Message.new("GET", url);
    },
    search: function() {
        let obj = this;

        this.session.queue_message(this.message, function(s, m) {
            function safe_xml(data) {
                return data.replace("<?xml version=\"1.0\" encoding=\"utf-8\"?>", "");
            }

            let mediaNs = Namespace("media", "http://search.yahoo.com/mrss/");

            let d = m.response_body.data;
            let x = new XML(safe_xml(d));

            let items = x..item;

            for each (var item in items) {
                let thumbnail = item.mediaNs::thumbnail[0];
                let content = null;
                for each (var c in item.mediaNs::content) {
                    if (c.@medium == "document") {
                        content = c.@url.toString();
                    }
                }
                if (thumbnail != null && content != null) {
                    let thumbnail_url = thumbnail.@url.toString();
                    obj.addImage(thumbnail_url.substring(thumbnail_url.lastIndexOf("/")),
                                thumbnail_url,
                                content);
                }
            }

            obj.emit('search_images_done');
        });
    }
}

Signals.addSignalMethods(LocalProvider.prototype);
Signals.addSignalMethods(DeviantArtProvider.prototype);

/**
 * Represents a wallpaper on the grid
 */
function WallImage() {
    this._init.apply(this, arguments);
}

WallImage.prototype = {
    _init: function(grid, image) {
        this._image = image;
        this._parent = grid;

        let box = new Shell.GenericContainer();
        box.connect("allocate", Lang.bind(this, this._allocate));

        let textureCache = St.TextureCache.get_default();
        this._thumbnail = new St.Bin({x_fill: true,
                              y_fill: true,
                              x_align: St.Align.MIDDLE,
                              y_align: St.Align.MIDDLE,
                              style_class: 'wallpaper-thumbnail',
                              child: textureCache.load_uri_async(
                                        image.thumbnail_path,
                                        THUMBNAIL_WIDTH,
                                        THUMBNAIL_HEIGHT)});
        box.add_actor(this._thumbnail);

        let clickable = new St.Button({'reactive': true, 'x_fill': true, 'y_fill': true,
                                       'y_align': St.Align.MIDDLE });
        clickable.set_child(box);
        this.actor = clickable;

        this.actor.connect('clicked', Lang.bind(this, this._onClicked));
    },
    _allocate: function(container, box, flags) {
        let childBox = new Clutter.ActorBox();

        childBox.x1 = 0;
        childBox.y1 = 0;
        childBox.x2 = CELL_WIDTH;
        childBox.y2 = CELL_HEIGHT;
        this._thumbnail.allocate(childBox, flags);
    },

    _onClicked: function() {
        let obj = this ;
        this.emit("download_started");
        
        GLib.idle_add(GLib.PRIORITY_DEFAULT,
            function() { obj._setBackground(); },
            null, function () {});

    },

    _setBackground: function() {
        let file_path = this._image.complete_path;
        let obj = this;

        if (file_path.indexOf("http") == 0) {
            let f = Gio.file_new_for_uri(file_path);
            file_path = "/tmp/" + this._image.name;

            f.copy(Gio.file_new_for_path(file_path),
                    Gio.FileCopyFlags.OVERWRITE,
                    Gio.Cancellable.get_current(),
                    function(c, total) {
                        let percentage = c * 100 / total ;
// obj._parent._on_download_progress(this, c * 100 / total);
                        obj.emit("download_progress", c * 100 / total);
                        if ( percentage >= 100 ) {
                            obj.emit("done");
                        }
                    },
                    obj);

            file_path = "file://" + file_path ;
        }
        else {
            obj.emit("done");
        }

        // Change background
        let settings = new Gio.Settings({ schema: SET_BACKGROUND_SCHEMA });
        settings.set_string(SET_BACKGROUND_KEY, file_path);

        return false;
    }
};

Signals.addSignalMethods(WallImage.prototype);


function WallSelector() {
    this._init.apply(this, arguments);
}

/**
 * Some grid allocation code just copied from gnome-shell/js/ui/IconGrid.js
 *
 */
WallSelector.prototype = {
    _init: function() {
        this._provider = new LocalProvider();

        this.actor = new St.BoxLayout({ vertical: true });
        // this._grid = new IconGrid.IconGrid({ xAlign: St.Align.START });
        this._content = new St.BoxLayout({ vertical: true });

        this._grid = new Shell.GenericContainer();
        this._grid.connect('allocate', Lang.bind(this, this._gridAllocate));

        this._grid.connect('get-preferred-width', Lang.bind(this, this._getPreferredWidth));
        this._grid.connect('get-preferred-height', Lang.bind(this, this._getPreferredHeight));

        let scrollview = new St.ScrollView({ x_fill: true,  y_fill: true });
        scrollview.set_policy(Gtk.PolicyType.NEVER, Gtk.PolicyType.AUTOMATIC);
        this._content.add(this._grid);
        scrollview.add_actor(this._content);

        // Image providers labels
        let providerBox = new St.BoxLayout({ vertical: false});
        let localBtn = new  St.Button({label: "Local images",
                                x_align: St.Align.START,
                                style_class: "panel-button",
                                can_focus: true,
                                reactive: true}); 
        localBtn.connect('clicked', Lang.bind(this, this._onLocalClicked));

        let deviantartBt = new St.Button({label: "www.deviantart.com",
                                x_align: St.Align.START,
                                style_class: "panel-button",
                                can_focus: true,
                                reactive: true}); 
        deviantartBt.connect('clicked', Lang.bind(this, this._onDeviantArtClicked));
        providerBox.add(localBtn);
        providerBox.add(deviantartBt);
        this.actor.add(providerBox);

        // Images grid
        this.actor.add(scrollview, { x_fill: true, y_fill: true, expand: true });
        // Bottom 
        let bottomBox = new St.BoxLayout({ vertical: false});
        this._stop = false;
        this._spinner = new Panel.AnimatedIcon('process-working.svg', 24);
        bottomBox.add(this._spinner.actor, {} );
        this._spinner.actor.lower_bottom();

        let nextIcon = new St.Icon({icon_name: 'go-next'});
        let prevIcon = new St.Icon({icon_name: 'go-previous'});
        this._indicator_label = new St.Label({text: ""});
        bottomBox.add(this._indicator_label, {expand: true});
        bottomBox.add(prevIcon, {x_align: St.Align.END, x_fill: false});
        bottomBox.add(nextIcon, {x_align: St.Align.END, x_fill: false});

        this.actor.add(bottomBox);

        Main.overview.viewSelector.addViewTab('wallpaper-selector',
                                _("Wallpapers"),
                                this.actor);

        this._workId = Main.initializeDeferredWork(this.actor,
                Lang.bind(this, this.update));
    },

    update: function() {
        this.startAnimation();
        this._provider.connect('search_images_done',
                            Lang.bind(this, this._createWallpapersGrid));
/**
        GLib.thread_create_full(function() {
            this._provider.search();
        }, null, 0, true);
**/
        let obj = this;
        GLib.idle_add(GLib.PRIORITY_DEFAULT,
            function () { obj._provider.search();},
            null, function () {});
    },

    clean: function() {
        this._grid.destroy_children();
    },

    /**
     * Animatios
     */
    stopAndExit: function() {
        this.stopAnimation();
        Main.overview.hide();
    },

    stopAnimation: function() {
        if (this._stop)
            return;

        this._stop = true;
        Tweener.addTween(this._spinner.actor,
                         { opacity: 0,
                           time: SPINNER_ANIMATION_TIME,
                           transition: "easeOutQuad",
                           onCompleteScope: this,
                           onComplete: function() {
                               this._spinner.actor.opacity = 255;
                               this._spinner.actor.hide();
                           }
                         });
    },

    startAnimation: function() {
        this._stop = false;
        this._spinner.actor.show();
    },

    /**
     * Grid size and allocate metodhs
    */
    _getPreferredWidth: function (grid, forHeight, alloc) {
        let childCount = this._grid.get_children().length;
        alloc.min_size = CELL_WIDTH;
        alloc.natural_size = childCount* CELL_WIDTH;
    },

    _getVisibleChildren: function() {
        let children = this._grid.get_children();
        children = children.filter(function(actor) {
            return actor.visible;
        });
        return children;
    },

    _getPreferredHeight: function (grid, forWidth, alloc) {
        let children = this._getVisibleChildren();
        let nRows = Math.ceil(children.length / 3);
        let totalSpacing = Math.max(0, nRows - 1) * 2;
        let height = (nRows + 2) * CELL_HEIGHT + totalSpacing;
        alloc.min_size = height;
        alloc.natural_size = height;
    },
    _gridAllocate: function(container, box, flags) {
        let primary = global.get_primary_monitor();
        // move these to constants
        let gridSpacing = 5;
        let gridPadding = 5;
        let numColumns = 3;
        let numDrop = 10;

        let w = Math.floor((this._grid.width - ( (numColumns - 1) * gridSpacing + 2 * gridPadding )) / numColumns);
        let h = Math.floor(w * (primary.height / primary.width)) + numDrop;
        let childBox = new Clutter.ActorBox();
        let children = this._grid.get_children();
        for (let i = 0 ; i < children.length ; ++i) {
            let column = i % numColumns;
            let row = Math.floor(i / numColumns);
            let x = gridPadding + column * w;
            if ( column > 0 ) { x += gridSpacing * column; }
            let y = gridPadding + row * h;
            if ( row > 0 ) { y += gridSpacing * row; }
            childBox.x1 = x;
            childBox.y1 = y;
            childBox.x2 = x + w;
            childBox.y2 = y + h;
            children[i].allocate(childBox, flags);
        }
    },

    _createWallpapersGrid: function() {
        let images = this._provider.images();
        let i = 0 ;
        for (i = 0 ; i < images.length ; ++i ) {
            this._addWallpaper(i, images.length, images[i]);
        }

        this.stopAnimation();
    },
    _addWallpaper: function(i, total, image) {
        let wallBox = new WallImage(this, image);
        wallBox.connect("download_started", Lang.bind(this, this.startAnimation));
        wallBox.connect("download_progress", Lang.bind(this, this._on_download_progress));
        wallBox.connect("done", Lang.bind(this, this.stopAndExit));

        this._grid.add_actor(wallBox.actor);
    },
    _onDeviantArtClicked: function() {
        // Limpiamos e consultamos
        this.clean();
        this._provider = new DeviantArtProvider();
        this.update();
    },

    _on_download_progress: function(o, p) {
        this._indicator_label.set_text(p + "%");
    },

    _onLocalClicked: function() {
        // Limpiamos e consultamos
        this.clean();
        this._provider = new LocalProvider();
        this.update();
    }
};


// Put your extension initialization code here
function main() {
    new WallSelector();
}
