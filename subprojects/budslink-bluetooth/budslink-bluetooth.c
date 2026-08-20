#include "budslink-bluetooth.h"

#include <errno.h>
#include <unistd.h>
#include <sys/socket.h>

#include <bluetooth/bluetooth.h>
#include <bluetooth/rfcomm.h>
#include <bluetooth/l2cap.h>

#define LOG_DOMAIN "BudsLinkBluetooth"

G_GNUC_UNUSED
static void
log_socket_error(const gchar *operation)
{
    g_warning("%s failed: %s", operation, g_strerror(errno));
}

gint
budslink_rfcomm_connect(const gchar *address,
                        guint8 channel)
{
    struct sockaddr_rc addr = { 0 };
    gint fd;

    g_return_val_if_fail(address != NULL, -1);

    g_debug("Creating RFCOMM socket for %s channel %u",
            address, channel);

    fd = socket(AF_BLUETOOTH, SOCK_STREAM, BTPROTO_RFCOMM);

    if (fd < 0) {
        log_socket_error("socket(AF_BLUETOOTH, RFCOMM)");
        return -1;
    }

    addr.rc_family = AF_BLUETOOTH;
    addr.rc_channel = channel;

    if (str2ba(address, &addr.rc_bdaddr) < 0) {
        g_warning("Invalid Bluetooth address: %s", address);
        close(fd);
        return -1;
    }

    g_debug("Connecting RFCOMM socket to %s channel %u",
            address, channel);

    if (connect(fd,
                (struct sockaddr *) &addr,
                sizeof(addr)) < 0) {
        log_socket_error("RFCOMM connect");
        close(fd);
        return -1;
    }

    g_debug("RFCOMM connection established: fd=%d", fd);

    /*
     * Ownership of fd is transferred to the caller.
     */
    return fd;
}

gint
budslink_l2cap_connect(const gchar *address,
                       guint16 psm)
{
    struct sockaddr_l2 addr = { 0 };
    gint fd;

    g_return_val_if_fail(address != NULL, -1);

    g_debug("Creating L2CAP socket for %s PSM %u",
            address, psm);

    fd = socket(AF_BLUETOOTH,
                SOCK_SEQPACKET,
                BTPROTO_L2CAP);

    if (fd < 0) {
        log_socket_error("socket(AF_BLUETOOTH, L2CAP)");
        return -1;
    }

    addr.l2_family = AF_BLUETOOTH;
    addr.l2_psm = htobs(psm);

    if (str2ba(address, &addr.l2_bdaddr) < 0) {
        g_warning("Invalid Bluetooth address: %s", address);
        close(fd);
        return -1;
    }

    g_debug("Connecting L2CAP socket to %s PSM %u",
            address, psm);

    if (connect(fd,
                (struct sockaddr *) &addr,
                sizeof(addr)) < 0) {
        log_socket_error("L2CAP connect");
        close(fd);
        return -1;
    }

    g_debug("L2CAP connection established: fd=%d", fd);

    /*
     * Ownership of fd is transferred to the caller.
     */
    return fd;
}
