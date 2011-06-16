const Clutter = imports.gi.Clutter;
const Gettext = imports.gettext;
const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const Gtk = imports.gi.Gtk;
const Lang = imports.lang;
const Mainloop = imports.mainloop;
const Main = imports.ui.main;
const Pango = imports.gi.Pango;
const Params = imports.misc.params;
const Shell = imports.gi.Shell;
const Signals = imports.signals;
const St = imports.gi.St;

const DIRECTORIES = ["/usr/share/backgrounds",
                     GLib.get_home_dir() + "/Pictures"];

const THUMBNAIL_WIDTH = 300;
const THUMBNAIL_HEIGHT = 190;

const CELL_WIDTH = 310;
const CELL_HEIGHT = 190;

const SET_BACKGROUND_SCHEMA = "org.gnome.desktop.background";
const SET_BACKGROUND_KEY = "picture-uri";

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

function WallImage() {
    this._init.apply(this, arguments);
}

WallImage.prototype = {
    _init: function(grid, path) {
        this._path = path;

        let box = new Shell.GenericContainer();
        box.connect("allocate", Lang.bind(this, this._allocate));

        let textureCache = St.TextureCache.get_default();
        this._thumbnail = new St.Bin({x_fill: true,
                              y_fill: true,
                              x_align: St.Align.MIDDLE,
                              y_align: St.Align.MIDDLE,
                              style_class: 'wallpaper-thumbnail',
                              child: textureCache.load_uri_async(path,
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
        // Change background
        let settings = new Gio.Settings({ schema: SET_BACKGROUND_SCHEMA });
        settings.set_string(SET_BACKGROUND_KEY, this._path);
        Main.overview.hide();
        return false;
    }
};



function WallSelector() {
    this._init.apply(this, arguments);
}

/**
 * Some grid allocation code just copied from gnome-shell/js/ui/IconGrid.js
 *
 */
WallSelector.prototype = {
    _init: function() {
        this._wallpapers = [];
        this._loadWallpapers(DIRECTORIES);

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

        this.actor.add(scrollview, { x_fill: true, y_fill: true, expand: true });

        Main.overview.viewSelector.addViewTab('wallpaper-selector',
                                _("Wallpapers"),
                                this.actor);
        this._createWallpapersGrid();
    },

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
    _loadWallpapers: function(dirs) {
        let i = 0;
        for ( i = 0; i < dirs.length; i++ ) {
            let dir = dirs[i];
            let wallsDir = Gio.file_new_for_path(dir);
            if (wallsDir.query_exists(null)) {
                let children = wallsDir.enumerate_children('standard::name',
                                  Gio.FileQueryInfoFlags.NONE, null);
                let file = null;
                while (( file = children.next_file(null) ) != null ) {
                    let name = file.get_name();
                    if (name.isImage()) {
                        this._wallpapers.push("file://" + dir + "/" + name);
                    }
                }
            }
        }
    },
    _createWallpapersGrid: function() {
        let i = 0 ;
        for (i = 0 ; i < this._wallpapers.length ; ++i ) {
            this._addWallpaper(i, this._wallpapers.length, this._wallpapers[i]);
        }
    },
    _addWallpaper: function(i, total, path) {
        let wallBox = new WallImage(this, path);

        this._grid.add_actor(wallBox.actor);
    }
};


// Put your extension initialization code here
function main() {
    new WallSelector();
}
