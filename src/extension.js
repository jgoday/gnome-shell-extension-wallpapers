const Clutter = imports.gi.Clutter;
const Gettext = imports.gettext;
const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const Gtk = imports.gi.Gtk;
const IconGrid = imports.ui.iconGrid;
const Lang = imports.lang;
const Mainloop = imports.mainloop;
const Main = imports.ui.main;
const Pango = imports.gi.Pango;
const Params = imports.misc.params;
const Shell = imports.gi.Shell;
const Signals = imports.signals;
const St = imports.gi.St;

const DIRECTORIES = ["/usr/share/backgrounds"];

const THUMBNAIL_WIDTH = 128;
const THUMBNAIL_HEIGHT = 96;
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
    _init: function(selector, path) {
        this._selector = selector;
        this._thumbnail = null;
        this._path = path;

        let box = new Shell.GenericContainer();

        box.connect("allocate", Lang.bind(this, this._allocate));
        box.connect('get-preferred-width',
                    Lang.bind(this, this._getPreferredWidth));
        box.connect('get-preferred-height',
                    Lang.bind(this, this._getPreferredHeight));
        let textureCache = St.TextureCache.get_default();
        let uri = path;
        this._thumbnail = new St.Bin({x_fill: true, y_fill: true,
                              x_align: St.Align.MIDDLE, y_align: St.Align.MIDDLE,
                              style_class: 'workspace-thumbnails-background',
                              child: textureCache.load_uri_async(uri,
                                    THUMBNAIL_WIDTH,
                                    THUMBNAIL_HEIGHT)});
        box.add_actor(this._thumbnail);

        let clickable = new St.Button({'reactive': true,
                                       'x_fill': true,
                                       'y_fill': true, 
                                       'y_align': St.Align.MIDDLE }); 
        clickable.set_child(box);
        this.actor = clickable;

        this.actor.connect('clicked', Lang.bind(this, this._onClicked));
    },
    _allocate: function(container, box, flags) {
        let childBox = new Clutter.ActorBox();

        // the actual thumbnail
        childBox.x1 = 0;
        childBox.y1 = 0;
        childBox.x2 = this.actor.width;
        childBox.y2 = this.actor.height - 40;
        this._thumbnail.allocate(childBox, flags);

        // the thumbnail caption 
        let textPadding = 5;
    },
    _getPreferredWidth: function(actor, forHeight, alloc) {
        this._getPreferredHeight(actor, -1, alloc);
    },
    _getPreferredHeight: function(actor, forWidth, alloc) {
        alloc.min_size = 230;
        alloc.natural_size = 250;
    },
    _onClicked: function() {
        // Change background
        let settings = new Gio.Settings({ schema: SET_BACKGROUND_SCHEMA });
        settings.set_string(SET_BACKGROUND_KEY, this._path);
        return false;
    }
};


function WallSelector() {
    this._init.apply(this, arguments);
}

WallSelector.prototype = {
    _init: function() {
        this._wallpapers = [];
        this._loadWallpapers();

        this._grid = new IconGrid.IconGrid({ xAlign: St.Align.START });

        let box = new St.BoxLayout({ vertical: true });
        box.add(this._grid.actor, { y_align: St.Align.START, expand: true });

        this.actor = new St.ScrollView({ x_fill: true,
                                         y_fill: false,
                                         y_align: St.Align.START,
                                         style_class: 'vfade' });
        this.actor.add_actor(box);
        this.actor.set_policy(Gtk.PolicyType.NEVER, Gtk.PolicyType.AUTOMATIC);
        this.actor.connect('notify::mapped', Lang.bind(this,
            function() {
                if (!this.actor.mapped)
                    return;

                let adjustment = this.actor.vscroll.adjustment;
                let direction = Overview.SwipeScrollDirection.VERTICAL;
                Main.overview.setScrollAdjustment(adjustment, direction);

                // Reset scroll on mapping
                adjustment.value = 0;
            }));
        this._createWallpapersGrid();

        Main.overview.viewSelector.addViewTab('wallpaper-selector',
                                _("Wallpapers"),
                                this.actor);
    },

    _loadWallpapers: function() {
        let i = 0;
        for ( i = 0; i < DIRECTORIES.length; i++ ) {
            let dir = DIRECTORIES[i];
            let wallsDir = Gio.file_new_for_path(dir);
            let children = wallsDir.enumerate_children('standard::name', 
                              Gio.FileQueryInfoFlags.NONE, null);
            _d("Searching dir: " + wallsDir);
            let file = null;
            while (( file = children.next_file(null) ) != null ) {
                let name = file.get_name();
                _d("Find file: " + name);
                // TODO : Check if is image
                if (name.isImage()) {
                    this._wallpapers.push("file://" + dir + "/" + name);
                }
            }
        }
    },
    _createWallpapersGrid: function() {
        for (i = 0 ; i < this._wallpapers.length ; ++i ) {
            this._addWallpaper(this._wallpapers[i]);
        }
    },
    _addWallpaper: function(path) {
        let wallBox = new WallImage(this, path);

        this._grid.addItem(wallBox.actor);
    }
};


// Put your extension initialization code here
function main() {
    new WallSelector();
}
