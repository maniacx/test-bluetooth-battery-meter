#ifndef BUDSLINK_BLUETOOTH_H
#define BUDSLINK_BLUETOOTH_H

#include <glib.h>
#include <gio/gio.h>

G_BEGIN_DECLS

/**
 * budslink_rfcomm_connect:
 * @address: Bluetooth device address, e.g. "AA:BB:CC:DD:EE:FF"
 * @channel: RFCOMM channel number
 *
 * Creates and connects an RFCOMM client socket.
 *
 * On success, ownership of the returned file descriptor is transferred
 * to the caller. The caller is responsible for closing it.
 *
 * Returns: the connected socket file descriptor,
 * or -1 on failure.
 */
gint budslink_rfcomm_connect(const gchar *address,
                             guint8 channel);

/**
 * budslink_l2cap_connect:
 * @address: Bluetooth device address, e.g. "AA:BB:CC:DD:EE:FF"
 * @psm: L2CAP Protocol/Service Multiplexer
 *
 * Creates and connects an L2CAP client socket.
 *
 * On success, ownership of the returned file descriptor is transferred
 * to the caller. The caller is responsible for closing it.
 *
 * Returns: the connected socket file descriptor,
 * or -1 on failure.
 */
gint budslink_l2cap_connect(const gchar *address,
                            guint16 psm);

G_END_DECLS

#endif
