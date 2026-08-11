'use strict';

/*
 * Edifier X5 Pro.
 *
 * Identified by the UUIDs its LE peer advertises, which match product id 323
 * ("X5 Pro") in the ConneX product database:
 *   search  00008000-0000-1000-8000-00805f9b34fb
 *   service 48098001-1a48-11e9-ab14-d663bd873d93
 *
 * A second entry (id 547, "X5 Pro 25版") uses search uuid 00000302-… and
 * service 48090302-…; both share the read/write characteristics below, so both
 * search UUIDs are accepted here.
 */
export default {
    name: 'X5 Pro',
    id: ['X5 Pro'],
    type: 'earbuds',

    searchUuids: [
        '00008000-0000-1000-8000-00805f9b34fb',
        '00000302-0000-1000-8000-00805f9b34fb',
    ],

    /* DEVICE_STATE_QUERY reports left, right and case levels separately. */
    batteryMultiple: true,
    batteryCase: true,

    /* ANC group 0x17: Noise Cancellation, Ambient Sound, Off. */
    noiseControl: {
        group: 0x17,
        modes: ['off', 'nc', 'ambient'],
    },

    inEarDetection: true,
    gameMode: true,

    albumArtIcon: 'earbuds',
    budsIcon: 'earbuds',
    case: 'case-normal',
};
