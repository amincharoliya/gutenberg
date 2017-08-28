# Meta Boxes

This is a brief document detailing how meta box support works in Gutenberg. With
the superior developer and user experience of blocks however, especially once,
block templates are available, **converting PHP meta boxes to blocks is highly
encouraged!**

## Breakdown

Each meta box area is rendered by a React component containing an iframe.
Each iframe will render a partial page containing only meta boxes for that area.
Meta box data is collected and used for conditional rendering. The meta box areas
will appear as toggle-able panels labeled "Extended Settings". More on this in
the MetaBoxIframe component section.

### Meta Box Data Collection

On each Gutenberg page load, the global state of post.php is mimicked, this is
hooked in as far back as `plugins_loaded`.

See `lib/register.php gutenberg_trick_plugins_into_registering_meta_boxes()`

This will register two new actions, one that fakes the global post state, and
one that collects the meta box data to determine if an area is empty. The
original global state is reset upon collection of meta box data.

gutenberg_set_post_state() is hooked in early on `admin_head` to fake the post
state. This is necessary for in cases where plugins access `$post->post_type`
early in `admin_head`.

Hooked in later on `admin_head` is `gutenberg_collect_meta_box_data()`, this will
run through the functions and hooks that `post.php` runs to register meta boxes;
namely `add_meta_boxes`, `add_meta_boxes_{$post->post_type}`, and `do_meta_boxes`.

A copy of the global `$wp_meta_boxes` is made then filtered through
`apply_filters( 'filter_gutenberg_meta_boxes', $_meta_boxes_copy );`, which will
strip out any core meta boxes along with standard custom taxonomy meta boxes.

Then each location for this particular type of meta box is checked for whether it
is active. If it is not empty a value of true is stored, if it is empty a value
of false is stored. This meta box location data is then dispatched by the editor
Redux store in `INITIALIZE_META_BOX_STATE`.

Ideally, this could be done at instantiation of the editor and help simplify
this flow. However, it is not possible to know the meta box state before
`admin_enqueue_scripts`, where we are calling `createEditorInstance()`. This will
have to do, unless we want to move `createEditorInstance()` to fire in the footer
or at some point after `admin_head`.

### Redux and React Meta Box Management.

*The Redux store by default will hold all meta boxes as inactive*. When
`INITIALIZE_META_BOX_STATE` comes in, the store will update any active meta box
areas by setting the `isActive` flag to `true`. Once this happens React will
check for the new props sent in by Redux on the `MetaBox` component. If that
`MetaBox` is now active, instead of rendering null, a `MetaBoxIframe` component will
be rendered. The `MetaBox` component is the container component that mediates
between the `MetaBoxIframe` and the Redux Store. *If no meta boxes are active,
nothing happens. This will be the default behavior, as all core meta boxes have
been stripped.*

#### MetaBoxIframe Component

When the component renders it will store a ref to the iframe, the component will
set up a listener for post messages to handle resizing. `assets/js/meta-box-resize.js` is
loaded inside the iframe and will send up postMessages for resizing, which the
`MetaBoxIframe` Component will use to manage its state. A mutation observer will
also be created when the iframe loads. The observer will detect whether, any
DOM changes have happened in the iframe, input and change event listeners will
also be attached to check for changes.

The change detection will store the current form's `FormData`, then whenever a
change is detected the current form data will be checked vs, the original form
data. This serves as a way to see if the meta box state is dirty. When the
meta box state has been detected to have changed, a Redux action
`META_BOX_STATE_CHANGED` is dispatched, updating the store setting the isDirty
flag to `true`. If the state ever returns back to the original form data,
`META_BOX_STATE_CHANGED` is dispatched again to set the isDirty flag to `false`.
A selector `isMetaBoxStateDirty()` is used to help check whether the post can be
updated. It checks each meta box for whether it is dirty, and if there is at
least one dirty meta box, it will return true. This dirty detection does not
impact creating new posts, as the content will have to change before meta boxes
can trigger the overall dirty state.

When the post is updated, only meta boxes that are active and dirty, will be
submitted. This removes any unnecessary requests being made. No extra revisions,
are created either by the meta box submissions. A Redux action will trigger on
`REQUEST_POST_UPDATE` for any dirty meta box. See `editor/effects.js`. The
`REQUEST_META_BOX_UPDATES` action will set that meta boxes' state to `isUpdating`,
the `isUpdating` prop will be sent into the `MetaBoxIframe` and cause a form
submission. The iframe will clone itself and perform a double buffer right
before the main iframe submits its data. After loading, the original change
detection process is fired again to handle the new state.

Since the meta box updating is being triggered on post save success, we check to
see if the post is saving and display an updating overlay, to prevent users from
changing the form values while the meta box is submitting. The saving overlay
could be made transparent, to give a more seamless effect.

### Iframe serving a partial page.

Each iframe will point to an individual source. These are partial pages being
served by post.php. Why this approach? By using post.php directly, we don't have
to worry as much about getting the global state 100% correct for each and every
use case of a meta box, especially when it comes to saving. Essentially, when
post.php loads it will set up all of its state correctly, and when it hits the
three `do_action( 'do_meta_boxes' )` hooks it will trigger our partial page.

`gutenberg_meta_box_partial_page()` is used to render the meta boxes for a context
then exit the execution thread early. A `meta_box` request parameter is used to
trigger this early exit. The `meta_box` request parameter should match one of
`'advanced'`, `'normal'`, or `'side'`. This value will determine which meta box
area is served. So an example url would look like:

`mysite.com/wp-admin/post.php?post=1&action=edit&meta_box=$location`

This url is automatically passed into React via a `_wpMetaBoxUrl` global variable.
The partial page is very similar to post.php and pretty much imitates it and
after rendering the meta boxes via `do_meta_boxes()` it imitates `admin_footer`,
exits early, and does some hook clean up. There are two extra files that are
enqueued. One is the js file from `assets/js/meta-box-resize.js`, which resizes the iframe.
The other is a stylesheet that is generated by webpack from `editor/meta-boxes/meta-box-iframe.scss`
and built into `editor/build/meta-box-iframe.css`

These styles make use of some of the SASS variables, so that as the Gutenberg
UI updates so will the meta boxes.

The partial page mimics the `post.php` post form, so when it is submitted it will
normally fire all of the necessary hooks and actions, and have the proper global
state to correctly fire any PHP meta box mumbo jumbo without needing to modify
any existing code. On successful submission the page will be reloaded back to
the same partial page with updated data. React will signal a `handleMetaBoxReload`
to set up the new form state for dirty checking, remove the updating overlay,
and set the store to no longer be updating the meta box area.