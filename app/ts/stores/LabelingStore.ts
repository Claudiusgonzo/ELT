import { AlignmentStore } from './AlignmentStore';
import { Track } from './dataStructures/alignment';
import { Dataset, SensorTimeSeries } from './dataStructures/dataset';
import { Label, LabelConfirmationState, PartialLabel, TimeRange } from './dataStructures/labeling';
import { SavedLabelingState } from './dataStructures/project';
import { resampleColumn } from './dataStructures/sampling';
import { mergeTimeRangeArrays, TimeRangeIndex } from './dataStructures/TimeRangeIndex';
import { labelingUiStore, projectStore, projectUiStore } from './stores';
import * as d3 from 'd3';
import { action, computed, observable } from 'mobx';



const colorbrewer6 = [
    '#a6cee3', '#b2df8a', '#fb9a99', '#fdbf6f', '#cab2d6', '#ffff99'
];

const d3category20 = [
    '#1f77b4', '#aec7e8', '#ff7f0e', '#ffbb78', '#2ca02c',
    '#98df8a', '#d62728', '#ff9896', '#9467bd', '#c5b0d5',
    '#8c564b', '#c49c94', '#e377c2', '#f7b6d2', '#7f7f7f',
    '#c7c7c7', '#bcbd22', '#dbdb8d', '#17becf', '#9edae5'
];


export class LabelingStore {
    private _labelsIndex: TimeRangeIndex<Label>;
    private _windowLabelsIndex: TimeRangeIndex<Label>;
    private _windowAccuracyLabelsIndex: TimeRangeIndex<Label>;

    private _windowLabelIndexHistory: TimeRangeIndex<Label>[];
    @observable public classes: string[];
    @observable public classColors: string[];
    @observable public classColormap: { [name: string]: string };
    @observable public timestampConfirmed: number;

    constructor(alignmentStore: AlignmentStore) {
        this._labelsIndex = new TimeRangeIndex<Label>();
        this._windowLabelsIndex = new TimeRangeIndex<Label>();
        this._windowAccuracyLabelsIndex = new TimeRangeIndex<Label>();

        this._windowLabelIndexHistory = [];

        this.classes = ['IGNORE', 'Positive'];
        this.updateColors();
        this.timestampConfirmed = null;

    }

    @computed public get labels(): Label[] {
        return this._labelsIndex.items;
    }

    public getLabelsInRange(timeRange: TimeRange): Label[] {
        return this._labelsIndex.getRangesInRange(timeRange);
    }


    @action public addLabel(label: Label): void {
        projectStore.recordLabelingSnapshot();
        this._labelsIndex.add(label);
    }

    @action public removeLabel(label: Label): void {
        projectStore.recordLabelingSnapshot();
        if (this._labelsIndex.has(label)) {
            this._labelsIndex.remove(label);
        }
    }

    @action public updateLabel(label: Label, newLabel: PartialLabel): void {
        projectStore.recordLabelingSnapshot();
        // Update the label info.
        if (newLabel.timestampStart !== undefined) { label.timestampStart = newLabel.timestampStart; }
        if (newLabel.timestampEnd !== undefined) { label.timestampEnd = newLabel.timestampEnd; }
        if (newLabel.className !== undefined) { label.className = newLabel.className; }
        if (newLabel.state !== undefined) { label.state = newLabel.state; }
        if (newLabel.suggestionConfidence !== undefined) { label.suggestionConfidence = newLabel.suggestionConfidence; }
        if (newLabel.suggestionGeneration !== undefined) { label.suggestionGeneration = newLabel.suggestionGeneration; }

    }

    @action public removeAllLabels(): void {
        projectStore.recordLabelingSnapshot();
        this._labelsIndex.clear();
    }

    @action public addClass(className: string): void {
        projectStore.recordLabelingSnapshot();
        if (this.classes.indexOf(className) < 0) {
            this.classes.push(className);
            this.updateColors();
        }
    }

    @action public removeClass(className: string): void {
        projectStore.recordLabelingSnapshot();
        // Remove the labels of that class.
        const toRemove = [];
        this._labelsIndex.forEach(label => {
            if (label.className === className) {
                toRemove.push(label);
            }
        });
        if (toRemove.length > 0) {
            toRemove.forEach(this._labelsIndex.remove.bind(this._labelsIndex));
        }

        // Remove the class.
        const index = this.classes.indexOf(className);
        if (index >= 0) {
            this.classes.splice(index, 1);
            this.updateColors();
        }
    }

    @action public renameClass(oldClassName: string, newClassName: string): void {
        projectStore.recordLabelingSnapshot();
        if (this.classes.indexOf(newClassName) < 0) {
            let renamed = false;
            this._labelsIndex.forEach(label => {
                if (label.className === oldClassName) {
                    label.className = newClassName;
                    renamed = true;
                }
            });
            const index = this.classes.indexOf(oldClassName);
            if (index >= 0) {
                this.classes[index] = newClassName;
                this.updateColors();
                labelingUiStore.currentClass = newClassName;
            }
        }
    }

    @action private updateColors(): void {
        // Update class colors, try to keep original colors.
        this.classColors = this.classes.map(() => null);
        const usedColors = [];
        if (this.classColormap) {
            for (let i = 0; i < this.classes.length; i++) {
                if (this.classColormap[this.classes[i]]) {
                    this.classColors[i] = this.classColormap[this.classes[i]];
                    usedColors.push(this.classColors[i]);
                } else {
                    this.classColors[i] = null;
                }
            }
        }

        let palette = d3category20;
        if (this.classes.length < 6) { palette = colorbrewer6; }

        for (let i = 0; i < this.classes.length; i++) {
            if (this.classColors[i] === null) {
                if (this.classes[i] === 'IGNORE') {
                    this.classColors[i] = '#CCC';
                    usedColors.push(this.classColors[i]);
                } else {
                    for (let j = 0; j < palette.length; j++) {
                        if (usedColors.indexOf(palette[j]) < 0) {
                            this.classColors[i] = palette[j];
                            usedColors.push(this.classColors[i]);
                            break;
                        }
                    }
                }
            }
        }
        this.classColormap = {};
        for (let i = 0; i < this.classColors.length; i++) {
            this.classColormap[this.classes[i]] = this.classColors[i];
        }
    }

    private _alignedDataset: Dataset = null;

    public makeNewAlignedDataset(tracks: Track[]): Dataset {
        // Update the aligned dataset.
        const dataset = new Dataset();
        // Here we generate a dataset with ONE timeSeries of uniform sample rate (the maximum of all series).
        // This makes it easier to process.

        // First determine the global dimensions and sample rate.
        const tracksToMerge: Track[] = [];
        // Gather all timeSeries.
        for (const track of tracks) {
            // Each track generate a set of timeSeries.
            if (track == null) { continue; } // skip empty track.
            // Assumption: the track only contain one timeSeries.
            tracksToMerge.push(track);
        }
        // The widest range of all series.
        const tMin = d3.min(tracksToMerge, ts => ts.referenceStart);
        const tMax = d3.max(tracksToMerge, ts => ts.referenceEnd);
        // Compute the max sample rate.
        const maxSampleRate = d3.max(tracksToMerge, ts =>
            ((ts.timeSeries[0] as SensorTimeSeries).dimensions[0].length - 1) /
            ts.duration);
        // How many samples in the new dataset.
        const totalSamples = Math.ceil((tMax - tMin) * maxSampleRate);
        // Compute the actual sample rate.
        const actualSampleRate = (totalSamples - 1) / (tMax - tMin);
        for (const ts of tracksToMerge) {
            const timeSeries = ts.timeSeries[0] as SensorTimeSeries;
            // Create the sensor structure.
            const sensor: SensorTimeSeries = {
                name: 'aggregated',
                kind: timeSeries.kind,
                dimensions: timeSeries.dimensions.map(d =>
                    resampleColumn(d, ts.referenceStart, ts.referenceEnd, tMin, tMax, totalSamples)),
                timestampStart: tMin,
                timestampEnd: tMax,
                sampleRate: actualSampleRate,
                scales: timeSeries.scales
            };
            dataset.addSensor(sensor);
        }

        dataset.timestampStart = tMin;
        dataset.timestampEnd = tMax;
        return dataset;
    }

    @computed public get alignedDataset(): Dataset {
        const tab = projectUiStore.currentTab;
        const tracks = projectStore.tracks;
        // Update only in labeling mode, if not in labeling mode, schedule an update once the mode is changed to labeling.
        if (tab !== 'labeling') {
            return this._alignedDataset;
        }
        this._alignedDataset = this.makeNewAlignedDataset(tracks);
        return this._alignedDataset;
    }

    @action public saveState(): SavedLabelingState {
        return {
            labels: this.labels,
            classes: this.classes,
            classColormap: this.classColormap
        };
    }

    @action public loadState(state: SavedLabelingState): void {
        if (state.classes) {
            this.classes = state.classes;
            this.classColormap = state.classColormap;
            this.updateColors();
        }

        this._labelsIndex.clear();
        for (const label of state.labels) {
            this._labelsIndex.add(label);
        }

        // Update the current class.
        const nonIgnoreClases = this.classes.filter(x => x !== 'IGNORE');
        labelingUiStore.currentClass = nonIgnoreClases.length > 0 ? nonIgnoreClases[0] : null;
    }

    public reset(): void {
        this._labelsIndex.clear();
        this.classes = ['IGNORE', 'Positive'];
        this.updateColors();
        const nonIgnoreClases = this.classes.filter(x => x !== 'IGNORE');
        labelingUiStore.currentClass = nonIgnoreClases.length > 0 ? nonIgnoreClases[0] : null;
    }

}
