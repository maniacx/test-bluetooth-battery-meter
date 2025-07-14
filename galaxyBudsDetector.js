import {
    GalaxyBudsModel, BudsNewUUID, BudsUUID, BudsLegacyUUID, LeAudioUUID, HandsFreeUUID,
    DeviceIdPrefixUUID } from './galaxyBudsConfig.js';

export function checkForSamsungBuds(uuids, modalias, name) {
    print(`name: ${name}`);
    print(`modalias: ${modalias}`);
    print(`uuids: ${uuids}`);

    if (!modalias.includes('v0075pA'))
        return null;

    const guids = uuids.map(u => u.toLowerCase());

    if (!(guids.includes(BudsNewUUID) || guids.includes(BudsUUID) ||
            guids.includes(BudsLegacyUUID)))
        return null;

    const coloredGuid = guids.find(g => g.startsWith(DeviceIdPrefixUUID));
    if (coloredGuid) {
        const hexId = coloredGuid.slice(DeviceIdPrefixUUID.length);
        if (hexId.length === 4) {
            const id = parseInt(hexId, 16);
            switch (id) {
                // Galaxy Buds
                case 0x0101: case 0x3800:
                    return GalaxyBudsModel.GalaxyBuds;
                // Buds+
                case 0x0102: case 0x0103: case 0x0104: case 0x0105:
                case 0x0106: case 0x0107: case 0x0108: case 0x0109:
                    return GalaxyBudsModel.GalaxyBudsPlus;
                // Buds Live
                case 0x0116: case 0x0117: case 0x0118:
                case 0x0119: case 0x011A: case 0x011B: case 0x011C:
                    return GalaxyBudsModel.GalaxyBudsLive;
                // Buds Pro
                case 0x012A: case 0x012B: case 0x012C: case 0x012D:
                    return GalaxyBudsModel.GalaxyBudsPro;
                // Buds2
                case 0x0139: case 0x013A: case 0x013B: case 0x013C:
                case 0x013D: case 0x013E: case 0x013F: case 0x0140:
                case 0x0141: case 0x3801:
                    return GalaxyBudsModel.GalaxyBuds2;
                // Buds2 Pro
                case 0x0146: case 0x0147: case 0x0148:
                    return GalaxyBudsModel.GalaxyBuds2Pro;
                // Buds FE
                case 0x014A: case 0x014B:
                    return GalaxyBudsModel.GalaxyBudsFe;
                // Buds3
                case 0x014D: case 0x014E:
                    return GalaxyBudsModel.GalaxyBuds3;
                // Buds3 Pro
                case 0x0154: case 0x0155:
                    return GalaxyBudsModel.GalaxyBuds3Pro;
                default:
                    break;
            }
        }

        if (guids.includes(LeAudioUUID) && guids.includes(HandsFreeUUID))
            return GalaxyBudsModel.GalaxyBuds2Pro;
        else
            return GalaxyBudsModel.GalaxyBuds2;
    }

    if (name) {
        const lower = name.toLowerCase();
        if (lower.includes('galaxy buds+'))
            return GalaxyBudsModel.GalaxyBudsPlus;
        if (lower.includes('galaxy buds'))
            return GalaxyBudsModel.GalaxyBuds;
        if (lower.includes('buds live'))
            return GalaxyBudsModel.GalaxyBudsLive;
        if (lower.includes('buds pro'))
            return GalaxyBudsModel.GalaxyBudsPro;
        if (lower.includes('buds2 pro'))
            return GalaxyBudsModel.GalaxyBuds2Pro;
        if (lower.includes('buds2'))
            return GalaxyBudsModel.GalaxyBuds2;
        if (lower.includes('buds fe'))
            return GalaxyBudsModel.GalaxyBudsFe;
        if (lower.includes('buds3 pro'))
            return GalaxyBudsModel.GalaxyBuds3Pro;
        if (lower.includes('buds3'))
            return GalaxyBudsModel.GalaxyBuds3;
    }
    return null;
}

