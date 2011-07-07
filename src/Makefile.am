extensionurl = https://github.com/jgoday/gnome-shell-extension-wallpapers

# Change these to modify how installation is performed
topextensiondir = $(datadir)/gnome-shell/extensions

uuid = wallpapers@jgoday.wordpress.com

extensiondir = $(topextensiondir)/$(uuid)

dist_extension_DATA = extension.js stylesheet.css
nodist_extension_DATA = metadata.json $(EXTRA_EXTENSION)

EXTRA_DIST = metadata.json.in

metadata.json: metadata.json.in $(top_builddir)/config.status
	$(AM_V_GEN) sed -e "s|[@]LOCALEDIR@|$(datadir)/locale|" \
	    -e "s|[@]uuid@|$(uuid)|" \
	    -e "s|[@]shell_current@|$(PACKAGE_VERSION)|" \
	    -e "s|[@]url@|$(extensionurl)|" $< > $@


gschemas_in = org.gnome.shell.extensions.wallpapers.gschema.xml.in

@INTLTOOL_XML_NOMERGE_RULE@

gsettings_SCHEMAS = $(gschemas_in:.xml.in=.xml)

@GSETTINGS_RULES@

CLEANFILES = metadata.json  $(gschemas_in:.xml.in=.valid) $(gsettings_SCHEMAS)
EXTRA_DIST += $(gschemas_in)

