// Alignment main view.
// - Including tracks (but not the reference track), markers and correspondences.
// - Handles alignment keyboard events.

import { Marker, Track } from '../../stores/dataStructures/alignment';
import { PanZoomParameters } from '../../stores/dataStructures/PanZoomParameters';
import { KeyCode } from '../../stores/dataStructures/types';
import * as stores from '../../stores/stores';
import { startDragging } from '../../stores/utils';
import { TimeAxis } from '../common/TimeAxis';
import { TrackView } from '../common/TrackView';
import { SVGGlyphiconButton } from '../svgcontrols/buttons';
import * as d3 from 'd3';
import { observer } from 'mobx-react';
import * as React from 'react';

export interface TrackLayout {
    y0: number;
    y1: number;
    height: number;
}

export interface AlignmentViewProps {
    // Viewport size.
    viewWidth: number;
    viewHeight: number;
    trackHeight: number;
    trackGap: number;
    referenceDetailedViewHeight: number;
    timeAxisHeight: number;
}

export interface AlignmentViewState {
    isCreatingCorrespondence?: boolean;
    markerStartKnob?: 'top' | 'bottom';
    markerStart?: Marker;
    markerTarget?: Marker;
    currentPosition?: [number, number];
}

@observer
export class AlignmentView extends React.Component<AlignmentViewProps, AlignmentViewState> {
    public refs: {
        [key: string]: Element,
        interactionRect: Element
    };

    constructor(props: AlignmentViewProps, context: any) {
        super(props, context);
        this.onKeyDown = this.onKeyDown.bind(this);
        this.onTrackMouseDown = this.onTrackMouseDown.bind(this);
        this.state = {};
    }


    public componentDidMount(): void {
        window.addEventListener('keydown', this.onKeyDown);
    }

    public componentWillUnmount(): void {
        window.removeEventListener('keydown', this.onKeyDown);
    }


    private onKeyDown(event: KeyboardEvent): void {
        if (event.srcElement === document.body) {
            if (event.keyCode === KeyCode.BACKSPACE || event.keyCode === KeyCode.DELETE) {
                if (stores.projectUiStore.selectedMarker) {
                    stores.alignmentStore.deleteMarker(stores.projectUiStore.selectedMarker);
                } else if (stores.projectUiStore.selectedCorrespondence) {
                    stores.alignmentStore.deleteMarkerCorrespondence(stores.projectUiStore.selectedCorrespondence);
                }
            }
        }
    }

    private onTrackMouseDown(
        event: React.MouseEvent<Element>, track: Track, time: number, pps: number): void {
        if (time < track.timeSeries[0].timestampStart || time > track.timeSeries[0].timestampEnd) { return; }
        const x0 = event.clientX;
        let moved = false;
        const rangeStart = stores.projectUiStore.getTrackPanZoom(track).rangeStart;
        const referenceRangeStart = stores.projectUiStore.referenceTrackPanZoom.rangeStart;
        startDragging(
            mouseEvent => {
                const x1 = mouseEvent.clientX;
                if (moved || Math.abs(x1 - x0) >= 3) {
                    moved = true;
                    if (track.isAlignedToReferenceTrack) {
                        const dt = (x1 - x0) / stores.projectUiStore.referenceTrackPanZoom.pixelsPerSecond;
                        stores.projectUiStore.setReferenceTrackPanZoom(
                            new PanZoomParameters(referenceRangeStart - dt, null));
                    } else {
                        const dt = (x1 - x0) / pps;
                        stores.projectUiStore.setTrackPanZoom(track, new PanZoomParameters(rangeStart - dt, pps));
                    }
                }
            },
            upEvent => {
                if (!moved) {
                    const marker = new Marker(time, track);
                    stores.alignmentStore.addMarker(marker);
                    stores.projectUiStore.selectMarker(marker);
                }
            });
    }

    private getRelativePosition(event: MouseEvent): number[] {
        const x: number = event.clientX - this.refs.interactionRect.getBoundingClientRect().left;
        const y: number = event.clientY - this.refs.interactionRect.getBoundingClientRect().top;
        return [x, y];
    }


    // When adding connections, find the candidate marker with the given event.
    private findCandidateMarker(event: MouseEvent): Marker {
        const target = event.target as Element;
        const ty = target.getAttribute('data-type');
        if (ty === 'marker') {
            const index = parseInt(target.getAttribute('data-marker-index'), 10);
            if (!isNaN(index)) {
                return stores.alignmentStore.markers[index];
            }
        }
        return null;
    }


    private startCreatingCorrespondence(marker: Marker, knob: 'top' | 'bottom', event: React.MouseEvent<Element>): void {
        // Select the marker first.
        stores.projectUiStore.selectMarker(marker);
        // Enter start creating correspondence state.
        this.setState({
            isCreatingCorrespondence: true,
            currentPosition: null,
            markerStartKnob: knob,
            markerStart: marker,
            markerTarget: null
        });

        startDragging(
            (moveEvent: MouseEvent) => {
                let candidate = this.findCandidateMarker(moveEvent);

                // Can't link to itself.
                if (candidate === this.state.markerStart) { candidate = null; }

                // Must link to track above/below.
                if (candidate) {
                    const trackIndex1 =
                        stores.projectStore.tracks.map(t => t.id)
                            .indexOf(this.state.markerStart.track.id);
                    const trackIndex2 =
                        stores.projectStore.tracks.map(t => t.id)
                            .indexOf(candidate.track.id);
                    if (!(trackIndex2 === trackIndex1 - 1 || trackIndex2 === trackIndex1 + 1)) { candidate = null; }
                }

                const [x, y] = this.getRelativePosition(moveEvent);
                this.setState({
                    isCreatingCorrespondence: true,
                    markerStart: marker,
                    markerTarget: candidate,
                    currentPosition: [x, y]
                });
            },
            upEvent => {
                const lastCandidate = this.state.markerTarget;

                this.setState({
                    isCreatingCorrespondence: false,
                    markerStartKnob: null,
                    currentPosition: null,
                    markerStart: null,
                    markerTarget: null
                });

                if (lastCandidate !== marker && lastCandidate !== null) {
                    const corr = stores.alignmentStore.addMarkerCorrespondence(marker, lastCandidate);
                    stores.projectUiStore.selectMarkerCorrespondence(corr);
                }
            });
    }


    private getMarkerLayout(marker: Marker, layoutMap: Map<string, TrackLayout>): {
        x: number,
        pps: number,
        xScale: (x: number) => number,
        xScaleInvert: (x: number) => number,
        y0: number,
        y1: number
    } {
        const track = marker.track;
        const trackLayout = layoutMap.get(track.id);
        if (!trackLayout) { return null; }
        const alignmentState = stores.projectUiStore.getTrackPanZoom(track);
        const [rangeStart, pixelsPerSecond] = [alignmentState.rangeStart, alignmentState.pixelsPerSecond];
        // scale: Reference -> Pixel.
        const sReferenceToPixel = d3.scaleLinear()
            .domain([rangeStart, rangeStart + this.props.viewWidth / pixelsPerSecond])
            .range([0, this.props.viewWidth]);
        // scale: Signal -> Reference.
        const sSignalToReference = d3.scaleLinear()
            .domain([track.timeSeries[0].timestampStart, track.timeSeries[0].timestampEnd])
            .range([track.referenceStart, track.referenceEnd]);
        const x = sReferenceToPixel(sSignalToReference(marker.localTimestamp));
        const pps = sSignalToReference(sReferenceToPixel(1)) - sSignalToReference(sReferenceToPixel(0));
        return {
            x: x,
            pps: pps,
            xScale: t => sReferenceToPixel(sSignalToReference(t)),
            xScaleInvert: xx => sSignalToReference.invert(sReferenceToPixel.invert(xx)),
            y0: trackLayout.y0,
            y1: trackLayout.y1
        };
    }

    private computeTrackLayout(): Map<string, TrackLayout> {
        const map = new Map<string, TrackLayout>();

        let trackYCurrent = 50;
        const trackMinimizedHeight = 40;

        const referenceTrack = stores.projectStore.referenceTrack;
        if (referenceTrack) {
            map.set(referenceTrack.id, {
                y0: this.props.timeAxisHeight - this.props.referenceDetailedViewHeight,
                y1: this.props.timeAxisHeight,
                height: this.props.referenceDetailedViewHeight
            });
        }
        stores.projectStore.tracks.forEach(track => {
            const trackY = trackYCurrent;
            const height = track.minimized ? trackMinimizedHeight : this.props.trackHeight;
            map.set(track.id, {
                y0: trackY,
                y1: trackY + height,
                height: height
            });
            trackYCurrent += height + this.props.trackGap;
        });
        return map;
    }


    private renderTracks(layoutMap: Map<string, TrackLayout>): JSX.Element[] {
        return stores.projectStore.tracks.map(track => {
            const trackLayout = layoutMap.get(track.id);
            if (!trackLayout) { return null; }
            let timeAxis = null;
            const zoom = stores.projectUiStore.getTrackPanZoom(track);
            if (!track.isAlignedToReferenceTrack) {
                const scale = d3.scaleLinear()
                    .domain([zoom.rangeStart, zoom.rangeStart + this.props.viewWidth / zoom.pixelsPerSecond])
                    .range([0, this.props.viewWidth]);
                timeAxis = <TimeAxis scale={scale} transform='translate(0, 0)' />;
            }
            return (
                <g transform={`translate(0, ${trackLayout.y0})`} key={track.id}>

                    {timeAxis}

                    <TrackView
                        track={track}
                        viewWidth={this.props.viewWidth}
                        viewHeight={trackLayout.height}
                        onMouseDown={this.onTrackMouseDown}
                        zoomTransform={zoom}
                        useMipmap={true}
                        signalsViewMode={stores.labelingUiStore.signalsViewMode}
                    />
                    <rect className='track-decoration'
                        x={this.props.viewWidth} y={0}
                        width={3} height={trackLayout.height} />

                    <g transform={`translate(${this.props.viewWidth + 4}, 0)`}>
                        <SVGGlyphiconButton x={0} y={0} width={20} height={20} text='remove'
                            onClick={event => stores.projectStore.deleteTrack(track)} />
                        <SVGGlyphiconButton x={0} y={20}
                            width={20} height={20}
                            text={track.minimized ? 'plus' : 'minus'}
                            onClick={event =>
                                stores.projectUiStore.setTrackMinimized(track, !track.minimized)} />
                    </g>
                </g>
            );
        });
    }


    private renderCorrespondences(layoutMap: Map<string, TrackLayout>): JSX.Element[] {
        return stores.alignmentStore.correspondences.map((correspondence, index) => {
            const l1 = this.getMarkerLayout(correspondence.marker1, layoutMap);
            const l2 = this.getMarkerLayout(correspondence.marker2, layoutMap);
            if (!l1 || !l2) { return; }
            const y1 = l1.y1 < l2.y0 ? l1.y1 : l1.y0;
            const y2 = l1.y1 < l2.y0 ? l2.y0 : l2.y1;
            const isSelected = stores.projectUiStore.selectedCorrespondence === correspondence;
            return (
                <g className={`marker-correspondence ${isSelected ? 'selected' : ''}`} key={`correspondence-${index}`}>
                    <line key={`correspondence-${index}`}
                        x1={l1.x} x2={l2.x} y1={y1} y2={y2}
                    />
                    <line className='handler'
                        key={`correspondence-handler-${index}`}
                        x1={l1.x} x2={l2.x} y1={y1} y2={y2}
                        onClick={() =>
                            stores.projectUiStore.selectMarkerCorrespondence(correspondence)}
                    />
                </g>
            );
        });
    }


    private renderMarkers(layoutMap: Map<string, TrackLayout>): JSX.Element[] {
        // Markers:
        const markers: JSX.Element[] = [];

        stores.alignmentStore.markers.forEach((marker, markerIndex) => {
            const r = 6;
            const rh = 10;
            const layout = this.getMarkerLayout(marker, layoutMap);
            if (!layout) { return; }
            const { x, y0, y1, pps } = layout;
            const isSelected = stores.projectUiStore.selectedMarker === marker;
            markers.push((
                <g
                    key={`marker-${markerIndex}`}
                    className={`alignment-marker ${
                        (this.state.isCreatingCorrespondence && this.state.markerTarget === marker) ? 'marker-target' : ''
                        } ${
                        (this.state.isCreatingCorrespondence && this.state.markerStart === marker) ? 'marker-start' : ''
                        } ${isSelected ? 'selected' : ''}`}
                >
                    <line className='line'
                        x1={x} x2={x}
                        y1={y0} y2={y1}
                    />
                    <line className='handler'
                        x1={x} x2={x}
                        y1={y0} y2={y1}
                        onMouseEnter={event => {
                            if (stores.projectStore.isReferenceTrack(marker.track)) {
                                stores.projectUiStore.setReferenceTrackTimeCursor(marker.localTimestamp);
                            } else {
                                stores.projectUiStore.setTimeCursor(marker.track, marker.localTimestamp);
                            }
                        }}
                        onMouseDown={event => {
                            stores.projectUiStore.selectMarker(marker);
                            let isFirstUpdate = true;
                            startDragging(
                                (moveEvent: MouseEvent) => {
                                    const newT = this.getMarkerLayout(marker, layoutMap)
                                        .xScaleInvert(this.getRelativePosition(moveEvent)[0]);
                                    stores.alignmentStore.updateMarker(marker, newT, false, isFirstUpdate);
                                    isFirstUpdate = false;
                                    if (stores.projectStore.isReferenceTrack(marker.track)) {
                                        stores.projectUiStore.setReferenceTrackTimeCursor(newT);
                                    } else {
                                        stores.projectUiStore.setTimeCursor(marker.track, newT);
                                    }
                                },
                                () => { stores.alignmentStore.updateMarker(marker, marker.localTimestamp, true, false); }
                            );
                        }}
                    />
                    <circle
                        className='marker-circle'
                        cx={x} cy={y0} r={r}
                    />
                    <circle
                        className='marker-circle'
                        cx={x} cy={y1} r={r}
                    />
                    <circle
                        className='marker-handler'
                        cx={x} cy={y0} r={rh}
                        data-type='marker'
                        data-marker-index={markerIndex}
                        onMouseDown={event => this.startCreatingCorrespondence(marker, 'top', event)}
                    />
                    <circle
                        className='marker-handler'
                        cx={x} cy={y1} r={rh}
                        data-type='marker'
                        data-marker-index={markerIndex}
                        onMouseDown={event => this.startCreatingCorrespondence(marker, 'bottom', event)}
                    />
                </g>
            ));
            if (this.state.isCreatingCorrespondence &&
                this.state.markerStart === marker &&
                this.state.currentPosition) {
                markers.push((
                    <line key='temporary-correspondence' className='temporary-correspondence'
                        x1={x} y1={this.state.markerStartKnob === 'top' ? y0 : y1}
                        x2={this.state.currentPosition[0]} y2={this.state.currentPosition[1]}
                    />
                ));
            }
        });
        return markers;
    }


    public render(): JSX.Element {
        const layoutMap = this.computeTrackLayout();
        return (
            <g>
                <rect ref='interactionRect'
                    x={0} y={0}
                    width={this.props.viewWidth} height={this.props.viewHeight}
                    style={{ fill: 'none', stroke: 'none' }} />
                {this.renderTracks(layoutMap)}
                {this.renderCorrespondences(layoutMap)}
                {this.renderMarkers(layoutMap)}
            </g>
        );
    }
}
