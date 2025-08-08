-- 恋恋笔记本完整数据库表结构

-- 情侣空间表
create table spaces (
  id uuid primary key default gen_random_uuid(),
  space_name text not null,           -- 空间名称
  secret text not null unique,        -- 情侣专属密码
  partner1_name text not null,        -- 情侣A姓名
  partner2_name text not null,        -- 情侣B姓名
  anniversary_date date,              -- 在一起的日子（周年按此日期计算）
  partner1_birthday date,             -- A 的生日（可选）
  partner2_birthday date,             -- B 的生日（可选）
  created_at timestamp with time zone default timezone('utc', now()),
  updated_at timestamp with time zone default timezone('utc', now())
);

-- 发帖/分享表
create table posts (
  id uuid primary key default gen_random_uuid(),
  space_id uuid references spaces(id) on delete cascade,
  author_name text not null,          -- 发帖人姓名
  content text not null,              -- 内容
  post_type text default 'text',      -- 类型: text/mood/memory/photo
  mood_type text,                     -- 心情类型: happy/sad/love/excited等
  is_private boolean default false,   -- 是否私密(只对另一半可见)
  likes_count integer default 0,      -- 点赞数
  created_at timestamp with time zone default timezone('utc', now())
);

-- 评论表
create table comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid references posts(id) on delete cascade,
  author_name text not null,          -- 评论人姓名
  content text not null,              -- 评论内容
  created_at timestamp with time zone default timezone('utc', now())
);

-- 点赞表
create table likes (
  id uuid primary key default gen_random_uuid(),
  post_id uuid references posts(id) on delete cascade,
  author_name text not null,          -- 点赞人姓名
  created_at timestamp with time zone default timezone('utc', now()),
  unique(post_id, author_name)        -- 每人每帖只能点赞一次
);

-- 纪念日/重要日子表
create table milestones (
  id uuid primary key default gen_random_uuid(),
  space_id uuid references spaces(id) on delete cascade,
  title text not null,               -- 标题
  description text,                  -- 描述
  date date not null,               -- 日期
  milestone_type text default 'anniversary', -- 类型: anniversary/birthday/special
  created_by text not null,         -- 创建人
  created_at timestamp with time zone default timezone('utc', now())
);

-- 索引优化
create index spaces_secret_idx on spaces (secret);
create index posts_space_id_idx on posts (space_id);
create index posts_created_at_idx on posts (created_at);
create index comments_post_id_idx on comments (post_id);
create index likes_post_id_idx on likes (post_id);
create index milestones_space_id_idx on milestones (space_id);

-- RLS策略
alter table spaces enable row level security;
alter table posts enable row level security;
alter table comments enable row level security;
alter table likes enable row level security;
alter table milestones enable row level security;

-- 允许所有操作的策略（简化版，实际可以更细化）
create policy "Allow all operations" on spaces for all using (true) with check (true);
create policy "Allow all operations" on posts for all using (true) with check (true);
create policy "Allow all operations" on comments for all using (true) with check (true);
create policy "Allow all operations" on likes for all using (true) with check (true);
create policy "Allow all operations" on milestones for all using (true) with check (true);
