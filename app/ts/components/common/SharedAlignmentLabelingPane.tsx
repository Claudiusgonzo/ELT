import {KeyCode} from '../../stores/dataStructures/types';
import * as stores from '../../stores/stores';
import {AlignmentToolbar} from '../alignment/AlignmentToolbar';
import {AlignmentView} from '../alignment/AlignmentView';
import {ReferenceTrackDetail} from '../common/ReferenceTrackDetail';
import {ReferenceTrackOverview} from '../common/ReferenceTrackOverview';
import {LabelingToolbar} from '../labeling/LabelingToolbar';
import {LabelingView} from '../labeling/LabelingView';
import * as React from 'react';


interface AlignmentLabelingViewProps {
    mode: 'alignment' | 'labeling';
    toolbarHeight: number;
}

interface AlignmentLabelingViewState {
    layout: AlignmentLabelingViewLayout;
}

interface AlignmentLabelingViewLayout {
    viewWidth: number;
    viewHeight: number;
    toolbarViewX0: number;
    toolbarViewX1: number;
    toolbarViewY0: number;
    toolbarViewY1: number;
    SVGX0: number;
    SVGY0: number;
    SVGWidth: number;
    SVGHeight: number;
    referenceOverviewViewX0: number;
    referenceOverviewViewX1: number;
    referenceOverviewViewY0: number;
    referenceOverviewViewY1: number;
    timeAxisHeight: number;
    referenceDetailedViewX0: number;
    referenceDetailedViewX1: number;
    referenceDetailedViewY0: number;
    referenceDetailedViewY1: number;
    referenceDetailedViewHeight: number;
    detailedViewX0: number;
    detailedViewX1: number;
    detailedViewY0: number;
    detailedViewY1: number;
}

export class SharedAlignmentLabelingPane extends React.Component<AlignmentLabelingViewProps, AlignmentLabelingViewState> {
    public refs: {
        [key: string]: Element,
        container: Element,
        labelingView: Element,
        alignmentView: Element
    };

    constructor(props: AlignmentLabelingViewProps, context: any) {
        super(props, context);

        this.state = {
            layout: this.computeLayoutAttributes(800, 600, props)
        };

        this.computeLayout = this.computeLayout.bind(this);
        this.onKeyDown = this.onKeyDown.bind(this);
    }

    private computeLayout(): void {
        const containerWidth = this.refs.container.getBoundingClientRect().width;
        const containerHeight = this.refs.container.getBoundingClientRect().height;
        const layout = this.computeLayoutAttributes(containerWidth, containerHeight, this.props);
        this.setState({ layout: layout });
        setImmediate(() => {
            stores.projectUiStore.setViewWidth(layout.referenceOverviewViewX1 - layout.referenceOverviewViewX0);
        });
    }

    public componentWillReceiveProps(newProps: AlignmentLabelingViewProps): void {
        const containerWidth = this.refs.container.getBoundingClientRect().width;
        const containerHeight = this.refs.container.getBoundingClientRect().height;
        const layout = this.computeLayoutAttributes(containerWidth, containerHeight, newProps);
        this.setState({ layout: layout });
    }

    private onKeyDown(event: KeyboardEvent): void {
        if (event.srcElement === document.body) {
            if (event.keyCode === KeyCode.SPACE) {
                if (event.srcElement === document.body) {
                    // commented out before mobx usage
                    // new LabelingActions.togglePlayPause();
                }
            }
        }
    }

    public componentDidMount(): void {
        window.addEventListener('resize', this.computeLayout);
        window.addEventListener('keydown', this.onKeyDown);
        this.computeLayout();
    }

    public componentWillUnmount(): void {
        window.removeEventListener('resize', this.computeLayout);
        window.removeEventListener('keydown', this.onKeyDown);
    }

    public computeLayoutAttributes(viewWidth: number, viewHeight: number, props: AlignmentLabelingViewProps): AlignmentLabelingViewLayout {
        // Layout parameters.
        const overviewDetailsSVGXPadding1 = 8;
        const overviewDetailsSVGXPadding2 = 8 + 20;
        const overviewDetailsSVGYPadding1 = 25;
        const overviewDetailsSVGYPadding2 = 8;

        // Compute layout.

        // Y-direction:
        const toolbarViewY0 = 0;
        const toolbarViewY1 = toolbarViewY0 + this.props.toolbarHeight;

        const svgY0 = toolbarViewY1;
        const svgY1 = viewHeight;
        const svgHeight = svgY1 - svgY0;

        // these are related to the SVG, not globally:
        const referenceOverviewViewY0 = overviewDetailsSVGYPadding1;
        const referenceOverviewViewY1 = referenceOverviewViewY0 + 100;

        const timeAxisHeight = 22;

        const referenceDetailedViewHeight = 250;
        const referenceDetailedViewY0 = referenceOverviewViewY1 + 3;
        const referenceDetailedViewY1 = referenceDetailedViewY0 + referenceDetailedViewHeight;

        const detailedViewY0 = referenceDetailedViewY1;
        const detailedViewY1 = svgHeight - overviewDetailsSVGYPadding2;

        // X-direction:
        const svg0 = 0;
        const svgX1 = viewWidth;
        const svgWidth = svgX1 - svg0;

        // these are related to the SVG, not globally:
        const overviewViewX0 = overviewDetailsSVGXPadding1;
        const overviewViewX1 = svgWidth - overviewDetailsSVGXPadding2;

        const toolbarViewX0 = 0;
        const toolbarViewX1 = viewWidth;

        return {
            viewWidth: viewWidth,
            viewHeight: viewHeight,
            toolbarViewX0: toolbarViewX0,
            toolbarViewX1: toolbarViewX1,
            toolbarViewY0: toolbarViewY0,
            toolbarViewY1: toolbarViewY1,
            SVGX0: svg0,
            SVGY0: svgY0,
            SVGWidth: svgWidth,
            SVGHeight: svgHeight,
            referenceOverviewViewX0: overviewViewX0,
            referenceOverviewViewX1: overviewViewX1,
            referenceOverviewViewY0: referenceOverviewViewY0,
            referenceOverviewViewY1: referenceOverviewViewY1,
            timeAxisHeight: timeAxisHeight,
            referenceDetailedViewX0: overviewViewX0,
            referenceDetailedViewX1: overviewViewX1,
            referenceDetailedViewY0: referenceDetailedViewY0,
            referenceDetailedViewY1: referenceDetailedViewY1,
            referenceDetailedViewHeight: referenceDetailedViewHeight,
            detailedViewX0: overviewViewX0,
            detailedViewX1: overviewViewX1,
            detailedViewY0: detailedViewY0,
            detailedViewY1: detailedViewY1
        };
    }

    public render(): JSX.Element {
        const layout = this.state.layout;

        return (
            <div className='labeling-view' ref='container'>

                {
                    this.props.mode === 'alignment' ? (
                        <AlignmentToolbar
                            top={layout.toolbarViewY0}
                            left={layout.toolbarViewX0}
                            viewWidth={layout.toolbarViewX1 - layout.toolbarViewX0}
                            viewHeight={layout.toolbarViewY1 - layout.toolbarViewY0}
                            />
                    ) : this.props.mode === 'labeling' ? (
                        <LabelingToolbar
                            top={layout.toolbarViewY0}
                            left={layout.toolbarViewX0}
                            viewWidth={layout.toolbarViewX1 - layout.toolbarViewX0}
                            viewHeight={layout.toolbarViewY1 - layout.toolbarViewY0}
                            />
                    ) : null
                }

                <svg
                    style={{
                        position: 'absolute',
                        left: layout.SVGX0 + 'px',
                        top: layout.SVGY0 + 'px'
                    }}
                    width={layout.SVGWidth}
                    height={layout.SVGHeight}
                    >

                    <g transform={`translate(${layout.referenceOverviewViewX0}, ${layout.referenceOverviewViewY0})`}>
                        <ReferenceTrackOverview ref='overview'
                            viewWidth={layout.referenceOverviewViewX1 - layout.referenceOverviewViewX0}
                            viewHeight={layout.referenceOverviewViewY1 - layout.referenceOverviewViewY0}
                            downReach={layout.detailedViewY1 - layout.referenceOverviewViewY0}
                            mode={this.props.mode}
                            />
                    </g>

                    <g transform={`translate(${layout.referenceDetailedViewX0}, ${layout.referenceDetailedViewY0})`}>
                        <ReferenceTrackDetail ref='overview'
                            viewWidth={layout.referenceDetailedViewX1 - layout.referenceDetailedViewX0}
                            viewHeight={layout.referenceDetailedViewY1 - layout.referenceDetailedViewY0}
                            mode={this.props.mode}
                            />
                    </g>

                    <g transform={`translate(${layout.detailedViewX0}, ${layout.detailedViewY0})`}>
                        {
                            this.props.mode === 'alignment' ?
                                <AlignmentView ref='alignmentView'
                                    viewWidth={layout.detailedViewX1 - layout.detailedViewX0}
                                    viewHeight={layout.detailedViewY1 - layout.detailedViewY0}
                                    trackHeight={250}
                                    trackGap={40}
                                    referenceDetailedViewHeight={layout.referenceDetailedViewHeight}
                                    timeAxisHeight={layout.timeAxisHeight}
                                    />
                                : this.props.mode === 'labeling' ?
                                    <LabelingView ref='labelingView'
                                        viewWidth={layout.detailedViewX1 - layout.detailedViewX0}
                                        viewHeight={layout.detailedViewY1 - layout.detailedViewY0}
                                        trackHeight={250}
                                        trackGap={40}
                                        timeAxisHeight={layout.timeAxisHeight}
                                        />
                                    : null
                        }
                    </g>

                </svg>

            </div>
        );
    }
}
