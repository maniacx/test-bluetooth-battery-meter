project(
  'budslink-bluetooth',
  'c',
  meson_version: '>= 0.60.0',
  default_options: ['warning_level=2']
)

assert(
  meson.is_subproject(),
  'This project is only intended to be used as a subproject!'
)

gnome = import('gnome')

package_version = get_option('package_version')
pkglibdir = get_option('pkglibdir')
pkgdatadir = get_option('pkgdatadir')
enable_introspection = get_option('introspection')

assert(
  pkglibdir != '',
  'pkglibdir must be specified'
)

assert(
  pkgdatadir != '',
  'pkgdatadir must be specified'
)

glib_dep = dependency('glib-2.0')
gio_dep = dependency('gio-2.0')
bluez_dep = dependency('bluez')

deps = [
  glib_dep,
  gio_dep,
  bluez_dep,
]

c_args = [
  '-DG_LOG_DOMAIN="BudsLinkBluetooth"',
]

libbudslink_bluetooth = shared_library(
  'budslink-bluetooth',

  sources: [
    'budslink-bluetooth.c',
    'budslink-bluetooth.h',
  ],

  dependencies: deps,
  c_args: c_args,

  install: true,
  install_dir: pkglibdir,
)

if enable_introspection
  libbudslink_bluetooth_gir = gnome.generate_gir(
    libbudslink_bluetooth,

    sources: [
      'budslink-bluetooth.c',
      'budslink-bluetooth.h',
    ],

    namespace: 'BudsLinkBluetooth',
    nsversion: '1.0',

    identifier_prefix: 'Budslink',
    symbol_prefix: 'budslink',

    includes: [
      'GObject-2.0',
      'Gio-2.0',
    ],

    extra_args: [
      '--quiet',
    ],

    install: true,
    install_dir_gir: pkgdatadir,
    install_dir_typelib: join_paths(
      pkglibdir,
      'girepository-1.0'
    ),
  )
endif

libbudslink_bluetooth_dep = declare_dependency(
  link_with: libbudslink_bluetooth,
  include_directories: include_directories('.'),
  dependencies: deps,
)
