import { Select } from 'antd';
import { useRef } from 'react';

type Props = {
  id?: string;
  value?: string[];
  onChange?: (value: string[]) => void;
  'aria-describedby'?: string;
};

export default function KeywordTagsInput({ id, value, onChange, ...rest }: Props) {
  const lastCompositionEndAt = useRef<number | null>(null);

  return (
    <div
      className="keyword-tags"
      onCompositionEnd={(event) => {
        lastCompositionEndAt.current = event.nativeEvent.timeStamp;
      }}
    >
      <Select
        id={id}
        mode="tags"
        value={value}
        style={{ width: '100%' }}
        placeholder="输入关键词后按回车添加"
        tokenSeparators={[',', '，']}
        open={false}
        suffixIcon={null}
        aria-describedby={rest['aria-describedby']}
        onChange={(next) => {
          const seen = new Set<string>();
          const keywords: string[] = [];
          for (const item of next) {
            const keyword = item.trim();
            if (!keyword || seen.has(keyword)) continue;
            seen.add(keyword);
            keywords.push(keyword);
          }
          onChange?.(keywords);
        }}
        onInputKeyDown={(event) => {
          if (event.key !== 'Enter') return;
          const native = event.nativeEvent;
          const composing =
            native.isComposing ||
            (lastCompositionEndAt.current !== null &&
              Math.abs(native.timeStamp - lastCompositionEndAt.current) < 50);
          if (composing) {
            event.preventDefault();
            event.stopPropagation();
            return;
          }
          event.preventDefault();
        }}
      />
    </div>
  );
}
