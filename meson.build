project(
	'BudsLink',
	version: '0.2.1',
	license: ['GPL-3.0-or-later'],
	meson_version: '>= 0.61.0'
)

APP_NAME = 'BudsLink'
APP_ID = 'io.github.maniacx.BudsLink'
APP_COMMAND = 'budslink'
DESCRIPTION = 'Battery status and ANC control for several Bluetooth earbuds'
gnome = import('gnome')
i18n = import('i18n')
subdir('data')
subdir('src')
subdir('po')

gvc_namespace = 'budslink-gvc'

pkgdatadir = join_paths(get_option('datadir'), APP_ID)
pkglibdir  = join_paths(get_option('libdir'),  APP_ID)

libgvc = subproject(
  'gvc',
  default_options: [
    'package_name=' + gvc_namespace,
    'package_version=' + meson.project_version(),
    'pkgdatadir=' + pkgdatadir,
    'pkglibdir=' + pkglibdir,
    'static=false',
    'introspection=true',
    'alsa=false',
  ],
)

libgvc_gir = libgvc.get_variable('libgvc_gir')


