'use strict';
import Rsvg from 'gi://Rsvg';
import Gdk from 'gi://Gdk';

import {createLogger} from '../../lib/devices/logger.js';

const clogInfo = createLogger('ColorHelper');

export function setSourceColor(cr, sourceColor) {
    cr.setSourceRGBA(
        sourceColor.red,
        sourceColor.green,
        sourceColor.blue,
        sourceColor.alpha
    );
}

export function getInkBounds(filePath, svgSize) {
    let handle;

    try {
        handle = Rsvg.Handle.new_from_file(filePath);
    } catch {
        console.error(`Failed to load SVG: ${filePath}`);
        return null;
    }

    const intrinsic = handle.get_intrinsic_size_in_pixels();
    if (!Array.isArray(intrinsic) || intrinsic.length < 3 ||
                intrinsic[1] !== svgSize || intrinsic[2] !== svgSize) {
        clogInfo.info('Invalid SVG dimension');
        return null;
    }

    const viewport = new Rsvg.Rectangle({x: 0, y: 0, width: svgSize, height: svgSize});
    const [ok, inkRect] = handle.get_geometry_for_layer(null, viewport);
    if (!ok) {
        clogInfo.info('Invalid SVG geometry');
        return null;
    }
    return inkRect;
}

export function addVectorImage(cr, path, color)  {
    setSourceColor(cr, color);
    cr.translate(0, 0);
    let currentX = 0;
    let currentY = 0;
    const vectorPath = path.split(' ');
    for (let i = 0; i < vectorPath.length; i++) {
        if (vectorPath[i] === 'M') {
            currentX = parseFloat(vectorPath[i + 1]);
            currentY = parseFloat(vectorPath[i + 2]);
            cr.moveTo(currentX, currentY);
            i += 2;
        } else if (vectorPath[i] === 'L') {
            currentX = parseFloat(vectorPath[i + 1]);
            currentY = parseFloat(vectorPath[i + 2]);
            cr.lineTo(currentX, currentY);
            i += 2;
        } else if (vectorPath[i] === 'H') {
            currentX = parseFloat(vectorPath[i + 1]);
            cr.lineTo(currentX, currentY);
            i += 1;
        } else if (vectorPath[i] === 'V') {
            currentY = parseFloat(vectorPath[i + 1]);
            cr.lineTo(currentX, currentY);
            i += 1;
        } else if (vectorPath[i] === 'C') {
            const x1 = parseFloat(vectorPath[i + 1]);
            const y1 = parseFloat(vectorPath[i + 2]);
            const x2 = parseFloat(vectorPath[i + 3]);
            const y2 = parseFloat(vectorPath[i + 4]);
            const x3 = parseFloat(vectorPath[i + 5]);
            const y3 = parseFloat(vectorPath[i + 6]);
            cr.curveTo(x1, y1, x2, y2, x3, y3);
            currentX = x3;
            currentY = y3;
            i += 6;
        } else if (vectorPath[i] === 'Z') {
            cr.closePath();
        }
    }
    cr.fill();
}

export function getForegroundColor(widget) {
    const context = widget.get_style_context();
    const rgba = new Gdk.RGBA();

    context.lookup_color('window_fg_color', rgba);
    return rgba;
}

export function getBackgroundColor(widget) {
    const context = widget.get_style_context();
    const rgba = new Gdk.RGBA();

    context.lookup_color('window_bg_color', rgba);
    return rgba;
}
