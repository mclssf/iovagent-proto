import { defineComponent, h } from 'vue';

export const Icon = defineComponent({
  name: 'Icon',
  inheritAttrs: false,
  props: {
    icon: { type: String, default: '' },
    svg: { type: String, default: '' },
    color: { type: String, default: '' },
    size: { type: Number, default: 16 },
    svgClass: { type: String, default: '' },
  },
  setup(props, { attrs }) {
    return () => {
      const className = [props.svgClass, attrs.class].filter(Boolean);
      const style = {
        width: `${props.size}px`,
        height: `${props.size}px`,
        color: props.color || undefined,
        display: 'inline-block',
        verticalAlign: '-0.125em',
      };

      if (props.svg) {
        return h(
          'svg',
          {
            ...attrs,
            xmlns: 'http://www.w3.org/2000/svg',
            viewBox: '0 0 24 24',
            fill: 'none',
            stroke: 'currentColor',
            'stroke-width': 2,
            'stroke-linecap': 'round',
            'stroke-linejoin': 'round',
            class: className,
            style,
            role: 'img',
            'aria-hidden': 'true',
          },
          [h('path', { d: props.svg })],
        );
      }

      return h(
        'span',
        {
          ...attrs,
          class: className,
          style,
          role: 'img',
          'aria-hidden': 'true',
        },
        props.icon,
      );
    };
  },
});

export default Icon;
