
import { useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import './App.css';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// 检查环境变量是否配置
const isSupabaseConfigured = supabaseUrl && supabaseAnonKey;
const supabase = isSupabaseConfigured ? createClient(supabaseUrl, supabaseAnonKey) : null;

const TITLE = '恋恋笔记本';
const LOCAL_SPACE_KEY = 'lovenotebook_space';
const LOCAL_USER_KEY = 'lovenotebook_user';
const LOCAL_LAST_SECRET_KEY = 'lovenotebook_last_secret';
// 心情与类型中文映射
const MOOD_OPTIONS = [
  { key: 'happy', label: '开心' },
  { key: 'love', label: '爱意' },
  { key: 'excited', label: '兴奋' },
  { key: 'peaceful', label: '平静' },
  { key: 'grateful', label: '感激' },
  { key: 'sad', label: '难过' },
  { key: 'worried', label: '担心' },
  { key: 'tired', label: '疲惫' }
];
const MOOD_LABEL = Object.fromEntries(MOOD_OPTIONS.map(m => [m.key, m.label]));
const POST_TYPE_LABEL = { text: '文字', mood: '心情', memory: '回忆', photo: '照片' };

function App() {
  // 状态管理
  const [currentView, setCurrentView] = useState('welcome'); // welcome, createSpace, login, selectUser, main
  const [spaceData, setSpaceData] = useState(null);
  const [currentUser, setCurrentUser] = useState(localStorage.getItem(LOCAL_USER_KEY) || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // 表单数据
  const [formData, setFormData] = useState({
    spaceName: '',
    secret: '',
    partner1Name: '',
    partner2Name: '',
    anniversaryDate: '',
    partner1Birthday: '',
    partner2Birthday: ''
  });

  // 发帖数据
  const [postContent, setPostContent] = useState('');
  const [postType, setPostType] = useState('text');
  const [moodType, setMoodType] = useState('happy');
  const [isPrivate, setIsPrivate] = useState(false);

  // 帖子列表
  const [posts, setPosts] = useState([]);
  const [stats, setStats] = useState({ totalPosts: 0, daysCount: 0, nextAnnivDays: null, birthdays: [] });
  const [activeTab, setActiveTab] = useState('feed'); // feed | timeline | stats
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedComments, setExpandedComments] = useState({}); // { [postId]: boolean }
  const [commentInputs, setCommentInputs] = useState({}); // { [postId]: string }

  const contentRef = useRef(null);
  const realtimeRef = useRef(null);

  // 初始化检查
  useEffect(() => {
    // 恢复会话或自动进入选择身份
    const savedSpaceRaw = localStorage.getItem(LOCAL_SPACE_KEY);
    const savedUser = localStorage.getItem(LOCAL_USER_KEY);
    if (savedSpaceRaw) {
      try {
        const savedSpace = JSON.parse(savedSpaceRaw);
        setSpaceData(savedSpace);
        // 记住上次的密码，供登录页回填
        if (savedSpace.secret) {
          localStorage.setItem(LOCAL_LAST_SECRET_KEY, savedSpace.secret);
        }
        if (savedUser) {
          setCurrentUser(savedUser);
          setCurrentView('main');
        } else {
          setCurrentView('selectUser');
        }
        fetchPosts(savedSpace.id);
        setupRealtime(savedSpace.id);
      } catch (err) {
        console.error('恢复会话失败:', err);
        localStorage.removeItem(LOCAL_SPACE_KEY);
        localStorage.removeItem(LOCAL_USER_KEY);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 登录页回填密码
  useEffect(() => {
    if (currentView === 'login' && !formData.secret) {
      const lastSecret = localStorage.getItem(LOCAL_LAST_SECRET_KEY) || '';
      if (lastSecret) setFormData((p) => ({ ...p, secret: lastSecret }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentView]);

  // 创建新的情侣空间
  const handleCreateSpace = async (e) => {
    e.preventDefault();
    if (!isSupabaseConfigured) {
      setError('请先配置 Supabase 环境变量');
      return;
    }

    setLoading(true);
    setError('');
    
    try {
      const { data, error } = await supabase
        .from('spaces')
        .insert({
          space_name: formData.spaceName,
          secret: formData.secret,
          partner1_name: formData.partner1Name,
          partner2_name: formData.partner2Name,
          anniversary_date: formData.anniversaryDate || null,
          partner1_birthday: formData.partner1Birthday || null,
          partner2_birthday: formData.partner2Birthday || null
        })
        .select()
        .single();

      if (error) {
        // 检查是否是密码重复错误
        if (error.message?.includes('duplicate') || error.code === '23505') {
          setError('这个密码已经被使用了，请换一个密码试试');
        } else {
          setError('创建空间失败: ' + error.message);
        }
        return;
      }

      setSpaceData(data);
      localStorage.setItem(LOCAL_SPACE_KEY, JSON.stringify(data));
  if (data?.secret) localStorage.setItem(LOCAL_LAST_SECRET_KEY, data.secret);
      setCurrentView('selectUser');
  setupRealtime(data.id);
    } catch (err) {
      // 检查是否是密码重复错误
      if (err.message?.includes('duplicate') || err.code === '23505') {
        setError('这个密码已经被使用了，请换一个密码试试');
      } else {
        setError('创建空间失败: ' + err.message);
      }
      console.error('创建空间失败:', err);
    } finally {
      setLoading(false);
    }
  };

  // 登录到现有空间
  const handleLogin = async (e) => {
    e.preventDefault();
    if (!isSupabaseConfigured) {
      setError('请先配置 Supabase 环境变量');
      return;
    }

    setLoading(true);
    setError('');
    
    try {
      const { data, error } = await supabase
        .from('spaces')
        .select('*')
        .eq('secret', formData.secret)
        .maybeSingle();

      if (error) throw error;
      if (!data) {
        setError('密码不正确，请检查后重新输入');
        return;
      }

      setSpaceData(data);
      localStorage.setItem(LOCAL_SPACE_KEY, JSON.stringify(data));
  if (data?.secret) localStorage.setItem(LOCAL_LAST_SECRET_KEY, data.secret);
      setCurrentView('selectUser');
  setupRealtime(data.id);
    } catch (err) {
      setError('登录失败，请检查网络连接后重试');
      console.error('登录失败:', err);
    } finally {
      setLoading(false);
    }
  };

  // 选择用户身份
  const handleSelectUser = (userName) => {
    setCurrentUser(userName);
    localStorage.setItem(LOCAL_USER_KEY, userName);
    setCurrentView('main');
    fetchPosts(spaceData.id);
  };

  // 获取帖子列表
  const fetchPosts = async (spaceId) => {
    if (!isSupabaseConfigured) return;

    setLoading(true);
    try {
  const { data, error } = await supabase
        .from('posts')
        .select(`
          id, space_id, author_name, content, post_type, mood_type, is_private, created_at,
          likes:likes ( id, author_name ),
          comments:comments ( id, author_name, content, created_at )
        `)
        .eq('space_id', spaceId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setPosts((data || []).map(p => ({
        ...p,
        comments: (p.comments || []).sort((a,b) => new Date(a.created_at) - new Date(b.created_at))
      })));

      // 计算统计数据
      const totalPosts = data?.length || 0;
      const daysCount = spaceData?.anniversary_date 
        ? Math.floor((new Date() - new Date(spaceData.anniversary_date)) / (1000 * 60 * 60 * 24))
        : 0;
      const nextAnnivDays = spaceData?.anniversary_date ? daysUntilNextAnnual(spaceData.anniversary_date) : null;
      const birthdays = [];
      if (spaceData?.partner1_birthday) birthdays.push({ name: spaceData.partner1_name, days: daysUntilNextAnnual(spaceData.partner1_birthday) });
      if (spaceData?.partner2_birthday) birthdays.push({ name: spaceData.partner2_name, days: daysUntilNextAnnual(spaceData.partner2_birthday) });
      setStats({ totalPosts, daysCount, nextAnnivDays, birthdays });

    } catch (err) {
      setError('获取帖子失败');
      console.error('获取帖子失败:', err);
    } finally {
      setLoading(false);
    }
  };

  // 计算距离下一年同月同日的天数
  const daysUntilNextAnnual = (dateStr) => {
    if (!dateStr) return null;
    const base = new Date(dateStr);
    const now = new Date();
    let next = new Date(now.getFullYear(), base.getMonth(), base.getDate());
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (next < today) {
      next = new Date(now.getFullYear() + 1, base.getMonth(), base.getDate());
    }
    return Math.max(0, Math.ceil((next - now) / (1000 * 60 * 60 * 24)));
  };

  // 发布帖子
  const handlePost = async (e) => {
    e.preventDefault();
    if (!postContent.trim()) return;
    if (!isSupabaseConfigured) {
      setError('请先配置 Supabase 环境变量');
      return;
    }

    setLoading(true);
    setError('');
    
    try {
      const { error } = await supabase.from('posts').insert({
        space_id: spaceData.id,
        author_name: currentUser,
        content: postContent.trim(),
        post_type: postType,
        mood_type: postType === 'mood' ? moodType : null,
        is_private: isPrivate
      });

      if (error) throw error;

      setPostContent('');
      setPostType('text');
      setMoodType('happy');
      setIsPrivate(false);
      fetchPosts(spaceData.id);
      if (contentRef.current) contentRef.current.focus();
    } catch (err) {
      setError('发布失败: ' + err.message);
      console.error('发布失败:', err);
    } finally {
      setLoading(false);
    }
  };

  // 点赞
  const handleLike = async (postId) => {
    if (!isSupabaseConfigured) return;

    try {
      // 检查是否已点赞
  const { data: existingLike } = await supabase
        .from('likes')
        .select('id')
        .eq('post_id', postId)
        .eq('author_name', currentUser)
        .maybeSingle();

      if (existingLike) {
        // 取消点赞
        await supabase
          .from('likes')
          .delete()
          .eq('post_id', postId)
          .eq('author_name', currentUser);
      } else {
        // 添加点赞
        await supabase
          .from('likes')
          .insert({
            post_id: postId,
            author_name: currentUser
          });
      }

      fetchPosts(spaceData.id);
    } catch (err) {
      console.error('点赞失败:', err);
    }
  };

  // 添加评论
  const handleAddComment = async (postId) => {
    if (!isSupabaseConfigured) return;
    const content = (commentInputs[postId] || '').trim();
    if (!content) return;
    try {
      const { error } = await supabase.from('comments').insert({
        post_id: postId,
        author_name: currentUser,
        content
      });
      if (error) throw error;
      setCommentInputs(prev => ({ ...prev, [postId]: '' }));
      fetchPosts(spaceData.id);
    } catch (err) {
      console.error('评论失败:', err);
    }
  };

  // Realtime 推送
  const setupRealtime = (spaceId) => {
    if (!isSupabaseConfigured || !spaceId) return;
    // 清理旧频道
    if (realtimeRef.current) {
      supabase.removeChannel(realtimeRef.current);
      realtimeRef.current = null;
    }
    const channel = supabase.channel(`space-${spaceId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'posts', filter: `space_id=eq.${spaceId}` }, () => {
        fetchPosts(spaceId);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'comments' }, () => {
        // 仅当评论属于此空间的帖子时刷新
        fetchPosts(spaceId);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'likes' }, () => {
        fetchPosts(spaceId);
      })
      .subscribe();
    realtimeRef.current = channel;
  };

  useEffect(() => {
    return () => {
      if (realtimeRef.current) {
        supabase.removeChannel(realtimeRef.current);
      }
    };
  }, []);

  // 切换视图时清除错误信息
  useEffect(() => {
    setError('');
  }, [currentView]);

  // 退出登录
  const handleLogout = () => {
    localStorage.removeItem(LOCAL_SPACE_KEY);
    localStorage.removeItem(LOCAL_USER_KEY);
  localStorage.removeItem(LOCAL_LAST_SECRET_KEY);
    setSpaceData(null);
    setCurrentUser('');
    setCurrentView('welcome');
    setPosts([]);
    setFormData({
      spaceName: '',
      secret: '',
      partner1Name: '',
      partner2Name: '',
      anniversaryDate: ''
    });
  };

  // 过滤后的帖子（搜索）
  const filteredPosts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return posts;
    return posts.filter(p => {
      const text = `${p.content} ${p.author_name} ${p.post_type} ${p.mood_type || ''}`.toLowerCase();
      return text.includes(q);
    });
  }, [posts, searchQuery]);

  // 渲染单条帖子（含评论区）
  const renderPost = (post) => {
    const isLikedByMe = (post.likes || []).some(l => l.author_name === currentUser);
    const isMine = post.author_name === currentUser;
    const isCommentsOpen = !!expandedComments[post.id];
    const commentValue = commentInputs[post.id] || '';
    return (
      <article key={post.id} className={`post-card ${post.is_private ? 'private' : ''}`}>
        <div className="post-header">
          <div className="post-author">
            <div className="user-avatar small">{post.author_name[0]}</div>
            <div className="author-info">
              <span className="author-name">{post.author_name}{isMine && '（我）'}</span>
              <time className="post-time">
                {new Date(post.created_at).toLocaleString('zh-CN', { 
                  month: 'short', 
                  day: 'numeric', 
                  hour: '2-digit', 
                  minute: '2-digit' 
                })}
              </time>
            </div>
          </div>
          <div className="post-meta">
            {post.post_type === 'mood' && post.mood_type && (
              <span className="mood-indicator mood-chip">{MOOD_LABEL[post.mood_type] || '心情'}</span>
            )}
            {post.is_private && <span className="private-indicator">🔒</span>}
          </div>
        </div>
        <div className="post-content">
          {post.content}
        </div>
        <div className="post-actions">
          <button 
            className="action-btn like-btn"
            onClick={() => handleLike(post.id)}
            title={isLikedByMe ? '取消点赞' : '点赞'}
          >
            <span style={{filter: isLikedByMe ? 'none' : 'grayscale(1)'}}>
              ❤️
            </span>
            {(post.likes?.length || 0)}
          </button>
          <button 
            className="action-btn comment-btn"
            onClick={() => setExpandedComments(prev => ({ ...prev, [post.id]: !prev[post.id] }))}
            title={isCommentsOpen ? '收起评论' : '展开评论'}
          >
            💬 {post.comments?.length || 0}
          </button>
        </div>
        {isCommentsOpen && (
          <div className="comment-section">
            {(post.comments || []).map(c => (
              <div key={c.id} className="comment-item">
                <div className="user-avatar small">{c.author_name[0]}</div>
                <div className="comment-body">
                  <div className="comment-meta">
                    <span className="author-name">{c.author_name}</span>
                    <time className="post-time">{new Date(c.created_at).toLocaleString('zh-CN', {year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit'})}</time>
                  </div>
                  <div className="comment-content">{c.content}</div>
                </div>
              </div>
            ))}
            <div className="comment-input-row">
              <input
                className="input"
                placeholder="写下你的回应..."
                value={commentValue}
                onChange={e => setCommentInputs(prev => ({ ...prev, [post.id]: e.target.value }))}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAddComment(post.id); }}}
              />
              <button className="btn btn-primary" onClick={() => handleAddComment(post.id)} disabled={!commentValue.trim()}>
                发送
              </button>
            </div>
          </div>
        )}
      </article>
    );
  };

  // 时光轴
  const renderTimeline = () => {
    const groups = {};
    filteredPosts.slice().reverse().forEach(p => {
      const d = new Date(p.created_at);
      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      groups[key] = groups[key] || [];
      groups[key].push(p);
    });
    const dates = Object.keys(groups).sort();
    return (
      <div className="timeline-container">
        {dates.map(date => (
          <div key={date} className="timeline-group">
            <div className="timeline-date">{date}</div>
            <div className="timeline-items">
              {groups[date].map(p => (
                <div key={p.id} className="timeline-item">
                  {renderPost(p)}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  };

  // 统计
  const renderStats = () => {
  const byType = posts.reduce((acc,p)=>{const k=POST_TYPE_LABEL[p.post_type]||p.post_type;acc[k]=(acc[k]||0)+1;return acc;},{});
    const byAuthor = posts.reduce((acc,p)=>{acc[p.author_name]=(acc[p.author_name]||0)+1;return acc;},{});
  const moodDist = posts.filter(p=>p.post_type==='mood').reduce((acc,p)=>{const m=MOOD_LABEL[p.mood_type]||'其他';acc[m]=(acc[m]||0)+1;return acc;},{});
    const totalLikes = posts.reduce((acc,p)=>acc+(p.likes?.length||0),0);
    const privateCount = posts.filter(p=>p.is_private).length;
    const firstDate = posts.length? new Date(posts[posts.length-1].created_at): null;
    const days = firstDate? Math.max(1, Math.ceil((new Date()-firstDate)/(1000*60*60*24))) : 1;
    const avgPerDay = (posts.length/days).toFixed(2);

    const bar = (label, value, max) => (
      <div className="bar-row" key={label}>
        <span className="bar-label">{label}</span>
        <div className="bar-bg"><div className="bar" style={{width: `${max? Math.round((value/max)*100):0}%`}} /></div>
        <span className="bar-value">{value}</span>
      </div>
    );

    const maxType = Math.max(1, ...Object.values(byType), ...Object.values(byAuthor), ...Object.values(moodDist));

    return (
      <div className="stats-container">
        <div className="stats-grid">
          <div className="stat-card"><div className="stat-title">总帖数</div><div className="stat-value">{posts.length}</div></div>
          <div className="stat-card"><div className="stat-title">总点赞</div><div className="stat-value">{totalLikes}</div></div>
          <div className="stat-card"><div className="stat-title">私密占比</div><div className="stat-value">{posts.length? Math.round((privateCount/posts.length)*100):0}%</div></div>
          <div className="stat-card"><div className="stat-title">日均发帖</div><div className="stat-value">{avgPerDay}</div></div>
        </div>
        <div className="stats-section">
          <h3>类型分布</h3>
          {Object.keys(byType).length===0? <div className="empty-state">暂无数据</div> : Object.entries(byType).map(([k,v])=>bar(k,v,maxType))}
        </div>
        <div className="stats-section">
          <h3>双方活跃</h3>
          {Object.keys(byAuthor).length===0? <div className="empty-state">暂无数据</div> : Object.entries(byAuthor).map(([k,v])=>bar(k,v,maxType))}
        </div>
        <div className="stats-section">
          <h3>心情分布</h3>
          {Object.keys(moodDist).length===0? <div className="empty-state">暂无心情数据</div> : Object.entries(moodDist).map(([k,v])=>bar(k,v,maxType))}
        </div>
      </div>
    );
  };

  // 快捷键：Ctrl/Cmd+Enter 发送
  const onComposerKeyDown = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && postContent.trim()) {
      e.preventDefault();
      handlePost(e);
    }
  };

  // 渲染不同视图
  const renderView = () => {
    switch (currentView) {
      case 'welcome':
        return renderWelcome();
      case 'createSpace':
        return renderCreateSpace();
      case 'login':
        return renderLogin();
      case 'selectUser':
        return renderSelectUser();
      case 'main':
        return renderMain();
      default:
        return renderWelcome();
    }
  };

  // 欢迎页面
  const renderWelcome = () => (
    <div className="welcome-container">
      <div className="welcome-card">
        <h1 className="welcome-title">{TITLE}</h1>
        <p className="welcome-subtitle">专属于你们的爱情空间</p>
        <div className="welcome-buttons">
          <button 
            className="btn btn-primary"
            onClick={() => setCurrentView('createSpace')}
          >
            创建情侣空间
          </button>
          <button 
            className="btn btn-secondary"
            onClick={() => setCurrentView('login')}
          >
            进入现有空间
          </button>
        </div>
      </div>
    </div>
  );

  // 创建空间页面
  const renderCreateSpace = () => (
    <div className="form-container">
      <div className="form-card">
        <h2>创建情侣空间</h2>
        <form onSubmit={handleCreateSpace}>
          <div className="form-group">
            <label>空间名称</label>
            <input
              type="text"
              className="input"
              placeholder="给你们的空间起个名字"
              value={formData.spaceName}
              onChange={e => setFormData({...formData, spaceName: e.target.value})}
              required
            />
          </div>
          <div className="form-group">
            <label>专属密码</label>
            <input
              type="text"
              className="input"
              placeholder="设置一个只有你们知道的密码"
              value={formData.secret}
              onChange={e => setFormData({...formData, secret: e.target.value})}
              required
            />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>TA的名字</label>
              <input
                type="text"
                className="input"
                placeholder="第一个人的名字"
                value={formData.partner1Name}
                onChange={e => setFormData({...formData, partner1Name: e.target.value})}
                required
              />
            </div>
            <div className="form-group">
              <label>你的名字</label>
              <input
                type="text"
                className="input"
                placeholder="第二个人的名字"
                value={formData.partner2Name}
                onChange={e => setFormData({...formData, partner2Name: e.target.value})}
                required
              />
            </div>
          </div>
          <div className="form-group">
            <label>在一起的日子</label>
            <input
              type="date"
              className="input"
              value={formData.anniversaryDate}
              onChange={e => setFormData({...formData, anniversaryDate: e.target.value})}
              required
            />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>{formData.partner1Name || 'TA'} 的生日</label>
              <input
                type="date"
                className="input"
                value={formData.partner1Birthday}
                onChange={e => setFormData({...formData, partner1Birthday: e.target.value})}
                required
              />
            </div>
            <div className="form-group">
              <label>{formData.partner2Name || '你'} 的生日</label>
              <input
                type="date"
                className="input"
                value={formData.partner2Birthday}
                onChange={e => setFormData({...formData, partner2Birthday: e.target.value})}
                required
              />
            </div>
          </div>
          {error && <div className="error-message">{error}</div>}
          <div className="form-actions">
            <button type="button" className="btn btn-secondary" onClick={() => setCurrentView('welcome')}>
              返回
            </button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? '创建中...' : '创建空间'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  // 登录页面
  const renderLogin = () => (
    <div className="form-container">
      <div className="form-card">
        <h2>进入情侣空间</h2>
        <form onSubmit={handleLogin}>
          <div className="form-group">
            <label>专属密码</label>
            <input
              type="text"
              className="input"
              placeholder="输入你们的专属密码"
              value={formData.secret}
              onChange={e => setFormData({...formData, secret: e.target.value})}
              required
              autoFocus
            />
          </div>
          {error && <div className="error-message">{error}</div>}
          <div className="form-actions">
            <button type="button" className="btn btn-secondary" onClick={() => setCurrentView('welcome')}>
              返回
            </button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? '登录中...' : '进入空间'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  // 选择用户身份
  const renderSelectUser = () => (
    <div className="form-container">
      <div className="form-card">
        <h2>选择你的身份</h2>
        <p>你是：</p>
        <div className="user-selection">
          <button 
            className="user-card"
            onClick={() => handleSelectUser(spaceData.partner1_name)}
          >
            <div className="user-avatar">{spaceData.partner1_name[0]}</div>
            <div className="user-name">{spaceData.partner1_name}</div>
          </button>
          <button 
            className="user-card"
            onClick={() => handleSelectUser(spaceData.partner2_name)}
          >
            <div className="user-avatar">{spaceData.partner2_name[0]}</div>
            <div className="user-name">{spaceData.partner2_name}</div>
          </button>
        </div>
      </div>
    </div>
  );

  // 主页面
  const renderMain = () => (
    <div className="main-container">
      {/* 头部 */}
      <header className="header">
        <div className="header-content">
          <div className="space-info">
            <h1>{spaceData.space_name}</h1>
            <div className="stats">
              <span>共 {stats.totalPosts} 条记录</span>
              {stats.daysCount > 0 && <span>在一起 {stats.daysCount} 天</span>}
            </div>
          </div>
          <div className="user-menu">
            <div className="current-user">
              <div className="user-avatar small">{currentUser[0]}</div>
              <span>{currentUser}</span>
            </div>
            <button className="logout-btn" onClick={handleLogout}>
              退出
            </button>
          </div>
        </div>
        
        {/* 重要日期展示区 */}
        {(Number.isInteger(stats.nextAnnivDays) || stats.birthdays?.length > 0) && (
          <div className="date-highlights">
            {Number.isInteger(stats.nextAnnivDays) && (
              <div className="date-card anniversary">
                <div className="date-icon">💕</div>
                <div className="date-info">
                  <div className="date-label">下一周年</div>
                  <div className="date-value">{stats.nextAnnivDays === 0 ? '就是今天！' : `${stats.nextAnnivDays} 天后`}</div>
                </div>
              </div>
            )}
            {stats.birthdays?.map(b => (
              <div key={b.name} className="date-card birthday">
                <div className="date-icon">🎂</div>
                <div className="date-info">
                  <div className="date-label">{b.name} 生日</div>
                  <div className="date-value">{b.days === 0 ? '就是今天！' : `${b.days} 天后`}</div>
                </div>
              </div>
            ))}
          </div>
        )}
        {/* tabs & search */}
        <div className="toolbar">
          <div className="tabs">
            {['feed','timeline','stats'].map(tab => (
              <button key={tab} className={`tab-btn ${activeTab===tab?'active':''}`} onClick={()=>setActiveTab(tab)}>
                {tab==='feed' && '动态'}
                {tab==='timeline' && '时光轴'}
                {tab==='stats' && '统计'}
              </button>
            ))}
          </div>
          {activeTab !== 'stats' && (
            <input
              className="input search-input"
              placeholder="搜索内容、作者、心情..."
              value={searchQuery}
              onChange={e=>setSearchQuery(e.target.value)}
            />
          )}
        </div>
      </header>

      {/* 发帖区域 */}
      <div className="post-form-container">
        <form className="post-form" onSubmit={handlePost}>
          <div className="post-header">
            <div className="post-type-selector">
              <button
                type="button"
                className={`type-btn ${postType === 'text' ? 'active' : ''}`}
                onClick={() => setPostType('text')}
              >
                💭 文字
              </button>
              <button
                type="button"
                className={`type-btn ${postType === 'mood' ? 'active' : ''}`}
                onClick={() => setPostType('mood')}
              >
                😊 心情
              </button>
              <button
                type="button"
                className={`type-btn ${postType === 'memory' ? 'active' : ''}`}
                onClick={() => setPostType('memory')}
              >
                💕 回忆
              </button>
            </div>
            <div className="post-options">
              <label className="privacy-toggle">
                <input
                  type="checkbox"
                  checked={isPrivate}
                  onChange={e => setIsPrivate(e.target.checked)}
                />
                <span>私密</span>
              </label>
            </div>
          </div>
          
      {postType === 'mood' && (
            <div className="mood-selector">
        {MOOD_OPTIONS.map(({key,label}) => (
                <button
          key={key}
                  type="button"
          className={`mood-btn ${moodType === key ? 'active' : ''}`}
          onClick={() => setMoodType(key)}
                >
          {label}
                </button>
              ))}
            </div>
          )}

          <textarea
            ref={contentRef}
            className="post-input"
            placeholder={
              postType === 'text' ? '分享此刻的想法...' :
              postType === 'mood' ? '记录现在的心情...' :
              '记录美好的回忆...'
            }
            value={postContent}
            onChange={e => setPostContent(e.target.value)}
            rows={4}
            required
            disabled={loading}
            onKeyDown={onComposerKeyDown}
          />
          
          <div className="post-actions">
            <button type="submit" className="btn btn-primary" disabled={loading || !postContent.trim()}>
              {loading ? '发布中...' : '发布'}
            </button>
          </div>
        </form>
      </div>

      {/* 错误提示 */}
      {error && <div className="error-message">{error}</div>}

      {/* 帖子列表 */}
      {activeTab === 'stats' ? (
        renderStats()
      ) : activeTab === 'timeline' ? (
        renderTimeline()
      ) : (
        <div className="posts-container">
          {filteredPosts.length === 0 ? (
            <div className="empty-state">
              <p>没有匹配的记录，换个关键词试试～</p>
            </div>
          ) : (
            filteredPosts.map(post => renderPost(post))
          )}
        </div>
      )}
    </div>
  );

  return (
    <div className="app">
  {renderView()}
    </div>
  );
}

export default App;

// 组件内的辅助逻辑（需放在组件函数内，但这里为演示集中定义变量）
