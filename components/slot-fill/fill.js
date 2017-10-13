/**
 * External dependencies
 */
import { noop } from 'lodash';

/**
 * WordPress dependencies
 */
import { Component, createPortal } from '@wordpress/element';

class Fill extends Component {
	componentDidMount() {
		this.context.registerFill( this.props.name, this );
	}

	componentWillUnmount() {
		this.context.unregisterFill( this.props.name, this );
	}

	componentWillReceiveProps( nextProps ) {
		const { name } = nextProps;
		if ( this.props.name !== name ) {
			this.context.unregisterFill( this.props.name, this );
			this.context.registerFill( name, this );
		}
	}

	render() {
		const { name, children } = this.props;
		const slot = this.context.getSlot( name );
		return slot ? createPortal( children, slot ) : null;
	}
}

Fill.contextTypes = {
	getSlot: noop,
	registerFill: noop,
	unregisterFill: noop,
};

export default Fill;
