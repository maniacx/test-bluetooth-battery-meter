'use strict';

import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';
import Rsvg from 'gi://Rsvg';

import {setSourceColor, getInkBounds, addVectorImage} from './colorHelpers.js';
import {VectorImages} from './circularBatteryVectorImages.js';

export const CircleBatteryIcon = GObject.registerClass({
}, class CircleBatteryIcon extends Gtk.DrawingArea {
    _init(iconSize, deviceIcon, scriptDir, params = {}) {
        super._init({
            content_width: iconSize,
            content_height: iconSize,
            ...params,
        });

        this._iconSize = iconSize;
        this._deviceIcon = deviceIcon;
        this._scriptDir = scriptDir;

        this._loadDeviceIcon();

        this.set_draw_func(this._draw.bind(this));
    }

    _loadDeviceIcon() {
        this._transform = {};
        this._rsvgHandle = null;

        const intendedIconSize = 15;
        const svgSize = 16;
        const unscaledCanvasSize = 32;

        const iconFolder = `${this._scriptDir}/icons/hicolor/scalable/actions`;
        const filePath = `${iconFolder}/bbm-${this._deviceIcon}-symbolic.svg`;

        const inkRect = getInkBounds(filePath, svgSize);
        if (!inkRect)
            return;

        const intendedScale = intendedIconSize / svgSize;
        const displayScale = this._iconSize / unscaledCanvasSize;
        const scale = displayScale * intendedScale;
        const offsetXY = (unscaledCanvasSize - intendedIconSize) / 2;

        this._transform.scale = scale;
        this._transform.offsetXY = offsetXY;

        try {
            this._rsvgHandle = Rsvg.Handle.new_from_file(filePath);
        } catch {
            this._rsvgHandle = null;
        }
    }

    _assignWidgetColor() {
        const context = this.get_style_context();

        const fg = context.get_color();
        const success = context.lookup_color('success_color')[1] ?? fg;
        const error = context.lookup_color('error_color')[1] ?? fg;

        const baseLevelColor = fg.copy();
        baseLevelColor.alpha = 0.5;

        const fillLevelColor = this._percentage > 0 ? success : fg;

        return {
            foregroundColor: fg,
            baseLevelColor,
            fillLevelColor,
            disconnectedIconColor: error,
        };
    }

    _drawIcon(cr) {
        if (!this._rsvgHandle)
            return;

        cr.save();
        cr.scale(this._transform.scale, this._transform.scale);
        cr.translate(this._transform.offsetXY, this._transform.offsetXY);

        // Render SVG into alpha mask
        cr.pushGroup();
        this._rsvgHandle.render_cairo(cr);
        const pattern = cr.popGroup();

        // Apply foreground color through mask
        setSourceColor(cr, this._colors.foregroundColor);
        cr.mask(pattern);

        cr.restore();
    }


    _drawCircle(cr) {
        const size = this._iconSize;
        const one = size / 16;
        const strokeWidth = 1.8 * one;
        const p = this._percentage / 100;

        const radius = (size - strokeWidth) / 2;
        const cx = size / 2;
        const cy = size / 2;

        cr.save();
        cr.setLineWidth(strokeWidth);

        setSourceColor(cr, this._colors.baseLevelColor);
        cr.arc(cx, cy, radius, 0, Math.PI * 2);
        cr.stroke();

        setSourceColor(cr, this._colors.fillLevelColor);
        const angleOffset = -0.5 * Math.PI;
        cr.arc(cx, cy, radius, angleOffset, angleOffset + p * 2 * Math.PI);
        cr.stroke();

        cr.restore();
    }

    _drawChargingStatusVectors(cr) {
        if (this._status !== 'disconnected' && this._status !== 'charging')
            return;

        const chargingPath = VectorImages['charging-bolt'];
        const disconnectedPath = VectorImages['disconnected'];

        if (this._status === 'disconnected') {
            cr.fill();
            addVectorImage(cr, disconnectedPath, this._colors.disconnectedIconColor);
        } else if (this._status === 'charging') {
            addVectorImage(cr, chargingPath, this._colors.foregroundColor);
        }
        cr.fill();
    }

    _draw(area, cr) {
        if (!this._rsvgHandle)
            return;

        this._colors = this._assignWidgetColor();

        this._drawIcon(cr);
        this._drawCircle(cr);
        this._drawChargingStatusVectors(cr);
    }

    updateValues(percentage, status) {
        this._status = status;
        this._percentage = percentage;
        this.queue_draw();
    }
});

