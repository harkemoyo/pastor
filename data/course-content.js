/**
 * Comprehensive Pastoral Course Content
 * Provides rich theological lessons, readings, case studies, and interactive quizzes
 * modeled after UoPeople / Brightspace LMS standard curriculum structure.
 */

const courseContent = {
  // Course 1: Sound Doctrine & Biblical Theology (THEO 101)
  1: {
    // Module 1: Course Introduction
    1: {
      topics: [
        {
          id: '1-1',
          type: 'doc',
          title: 'Course Syllabus & Theological Standards',
          subtitle: 'Required reading',
          bannerTitle: 'Course Syllabus & Orientation',
          contentHtml: `
            <h3>Karibu to Sound Doctrine &amp; Biblical Theology</h3>
            <p>Welcome to this foundational semester at Pastors Theological Seminary. As a pastor or church leader shepherd in East Africa, your primary calling is to <em>rightly divide the word of truth</em> (2 Timothy 2:15) and protect Christ's flock from deceptive philosophies and false gospels.</p>
            
            <div class="theology-highlight-box">
              <h4>📖 Core Theological Stance</h4>
              <p>We confess the inerrancy, authority, and sufficiency of Holy Scripture. Salvation is by grace alone, through faith alone, in Christ alone, to the glory of God alone. We stand firmly against the prosperity gospel that reduces God to a transactional vending machine.</p>
            </div>

            <h4>Weekly Study Expectations</h4>
            <ul>
              <li><strong>Unit Overview &amp; Scripture Meditation:</strong> Read and reflect on the primary Bible texts every Monday.</li>
              <li><strong>Theological Readings:</strong> Work through the assigned expository readings by Wednesday.</li>
              <li><strong>Cohort Discussion Forum:</strong> Post your reflection and reply to at least two brother pastors by Friday.</li>
              <li><strong>Self-Quiz &amp; Ministry Application:</strong> Complete the self-evaluation before the unit deadline.</li>
            </ul>

            <div class="swahili-note-box">
              <strong>Kumbuka ya Kichungaji (Swahili Pastoral Note):</strong> Masomo haya yameandaliwa kukupa msingi thabiti wa kibiblia ili uweze kulisha kundi la Bwana kwa uaminifu bila kupotoshwa na mafundisho ya uongo ya kupanda mbegu za fedha.
            </div>
          `
        },
        {
          id: '1-2',
          type: 'doc',
          title: 'Instructor Welcome & Cohort Guide',
          subtitle: 'Faculty introduction',
          bannerTitle: 'Instructor Welcome',
          contentHtml: `
            <h3>Message from the Pastoral Faculty</h3>
            <p>Peace be unto you, servant of Christ. On behalf of the faculty and mentors of Intentional Discipleship Africa, we are honored to walk alongside you in this academic term.</p>
            <p>Many pastors in our region labor without formal theological training. This platform brings seminary-level Biblical education right to your parish or mobile device, designed with low data bandwidth in mind.</p>
            
            <div class="mentor-contact-card">
              <h4>Lead Faculty: Dr. Samuel Mwangi, Th.M., Ph.D.</h4>
              <p>Senior Lecturer in Systematic Theology &amp; Exegesis | Nairobi, Kenya</p>
              <p>Email: <a href="mailto:faculty@pastorslms.com">faculty@pastorslms.com</a> | WhatsApp Cohort Hours: Tuesday &amp; Thursday 2:00 PM - 5:00 PM EAT</p>
            </div>
          `
        }
      ]
    },

    // Module 2: Unit 1: What is the Gospel?
    2: {
      topics: [
        {
          id: '2-1',
          type: 'doc',
          title: 'Unit 1 Overview',
          subtitle: 'Orientation & objectives',
          bannerTitle: 'Unit 1 Overview',
          contentHtml: `
            <h3>Welcome to Unit 1: What is the Gospel?</h3>
            <p>In this opening unit, you will examine the single most crucial question in Christian theology and pastoral ministry: <em>What is the true gospel of Jesus Christ?</em> In many pulpits across Kenya and East Africa, the biblical gospel has been replaced with a gospel of financial accumulation, health guarantees, and human self-assertion.</p>

            <div class="scripture-focus-box">
              <h4>Maandiko ya Msingi (Scriptural Foundation)</h4>
              <p><strong>1 Corinthians 15:1-4:</strong> <em>"Now I would remind you, brothers, of the gospel I preached to you, which you received, in which you stand, and by which you are being saved... that Christ died for our sins in accordance with the Scriptures, that he was buried, that he was raised on the third day in accordance with the Scriptures."</em></p>
              <p><strong>Galatians 1:6-9:</strong> <em>"I am astonished that you are so quickly deserting him who called you in the grace of Christ and are turning to a different gospel—not that there is another one, but there are some who trouble you and want to distort the gospel of Christ."</em></p>
            </div>

            <h4>Learning Objectives</h4>
            <p>By the completion of Unit 1, you will be equipped to:</p>
            <ol>
              <li>Articulate the four foundational pillars of the biblical gospel: God, Man, Christ, and Response (Faith &amp; Repentance).</li>
              <li>Identify common counterfeits of the gospel circulating in contemporary African churches.</li>
              <li>Explain why adding human merit or financial gifts as prerequisites for salvation is anathema (Galatians 1:8).</li>
              <li>Teach your congregants to test sermons against the canonical apostolic witness.</li>
            </ol>

            <div class="pastoral-application-callout">
              <h4>Pastoral Context: The Kenyan Church</h4>
              <p>When congregants face real-world challenges—inflation, school fees, drought, or illness—the temptation to preach an easy transactional gospel is immense. Unit 1 grounds you in Christ's sufficient work, reminding our people that our ultimate treasure is reconciliation with Holy God, not earthly riches.</p>
            </div>
          `
        },
        {
          id: '2-2',
          type: 'doc',
          title: 'Unit 1 Reading Assignment',
          subtitle: 'Exegesis & theological text',
          bannerTitle: 'Unit 1 Reading Assignment',
          contentHtml: `
            <h3>Required Readings for Unit 1</h3>
            <p>Please complete the following biblical and theological readings before proceeding to the Assignment Activity and Cohort Discussion.</p>

            <div class="reading-card">
              <h4>Section 1: Canonical Scripture Text</h4>
              <ul>
                <li><strong>Galatians Chapters 1 &amp; 2:</strong> Paul's defense of the one true gospel without human additions.</li>
                <li><strong>Romans 3:21-28:</strong> Justification through faith in Jesus Christ apart from the works of the law.</li>
                <li><strong>Titus 3:4-7:</strong> Salvation grounded in God's mercy, not works of righteousness done by us.</li>
              </ul>
            </div>

            <div class="reading-card">
              <h4>Section 2: Expository Commentary Excerpt</h4>
              <p><em>From "The Cross of Christ" by Dr. John Stott:</em></p>
              <blockquote>
                "The cross is the revelation of God's justice and his love. At the cross, divine justice was fully satisfied, and divine mercy was freely poured out. We cannot add one penny to what Christ accomplished, nor can we buy God's favor with our tithes or vows. To preach anything less is to rob the cross of its glory."
              </blockquote>
            </div>

            <div class="reflection-prompts-box">
              <h4>Reflection Questions for Your Sermon Journal:</h4>
              <ol>
                <li>In your last four sermons, did the cross and repentance take center stage, or did motivational advice dominate?</li>
                <li>How can you help an elder or deacon who mistakenly believes that financial blessings indicate greater spiritual holiness?</li>
              </ol>
            </div>
          `
        },
        {
          id: '2-3',
          type: 'assignment',
          title: 'Assignment Activity Unit 1',
          subtitle: 'Due: Oct 15, 2026',
          dueDate: 'Oct 15, 2026',
          bannerTitle: 'Assignment Activity Unit 1',
          contentHtml: `
            <div class="assignment-header-meta">
              <span class="due-badge">📅 Due Date: Oct 15, 2026 at 11:59 PM EAT</span>
              <span class="points-badge">Graded: 100 Points</span>
            </div>

            <h3>Pastoral Case Study: Evaluating a Local Sermon</h3>
            <p><strong>Assignment Prompt:</strong> Imagine a visiting evangelist comes to your church and preaches the following: <em>"If you are sick or poor today, it is because your faith is deficient or you have not planted a sacrificial seed into the altar of this ministry. God is obligated to make you wealthy if you claim it with faith."</em></p>
            
            <p>Write a 400–600 word pastoral evaluation answering:</p>
            <ol>
              <li>Which specific biblical passages refute this teaching? (Quote at least two passages).</li>
              <li>How would you gently counsel a distressed member of your congregation who planted a seed with their last savings but remains in distress?</li>
              <li>Outline 3 biblical truths you will preach the following Sunday to restore sound doctrine.</li>
            </ol>

            <div class="interactive-submission-area">
              <h4>Your Assignment Submission:</h4>
              <p class="sub-help">Type or paste your response below. You may save a draft or submit directly for faculty grading.</p>
              <textarea id="assignmentInput" class="assignment-textarea" rows="8" placeholder="Type your pastoral evaluation here... (e.g., In addressing the visiting speaker's claims, Scripture is unambiguous...)"></textarea>
              <div class="submission-actions">
                <button type="button" class="btn btn-outline" onclick="alert('Draft saved locally to your device.')">Save Draft</button>
                <button type="button" class="btn btn-primary" id="btnSubmitAssignment">Submit for Faculty Evaluation</button>
              </div>
              <div id="assignmentSuccessMsg" class="assignment-success" style="display: none;">
                ✓ <strong>Assignment Successfully Submitted!</strong> Your faculty mentor Dr. Mwangi will review your theological case study within 48 hours.
              </div>
            </div>
          `
        },
        {
          id: '2-4',
          type: 'quiz',
          title: 'Self-Quiz Unit 1',
          subtitle: 'Due: Oct 15, 2026',
          dueDate: 'Oct 15, 2026',
          bannerTitle: 'Self-Quiz Unit 1',
          contentHtml: `
            <div class="quiz-header-meta">
              <span class="due-badge">📅 Due Date: Oct 15, 2026 at 11:59 PM EAT</span>
              <span class="points-badge">4 Multiple Choice Questions</span>
            </div>

            <h3>Unit 1 Self-Assessment Quiz</h3>
            <p>This self-quiz assesses your grasp of the core doctrines covered in Unit 1. You may attempt this quiz multiple times to solidify your understanding.</p>

            <form id="unitQuizForm" class="unit-quiz-form">
              <!-- Question 1 -->
              <div class="quiz-question-card" data-q="1" data-correct="b">
                <div class="quiz-q-num">Question 1 of 4</div>
                <p class="quiz-q-text">According to 1 Corinthians 15:1-4, what are the central historical facts that constitute the apostolic gospel?</p>
                <div class="quiz-options">
                  <label class="quiz-option-label">
                    <input type="radio" name="q1" value="a">
                    <span>A) Jesus came to give believers financial wealth and worldly triumph</span>
                  </label>
                  <label class="quiz-option-label">
                    <input type="radio" name="q1" value="b">
                    <span>B) Christ died for our sins according to the Scriptures, was buried, and was raised on the third day</span>
                  </label>
                  <label class="quiz-option-label">
                    <input type="radio" name="q1" value="c">
                    <span>C) Mankind possesses natural goodness that only requires moral guidance</span>
                  </label>
                  <label class="quiz-option-label">
                    <input type="radio" name="q1" value="d">
                    <span>D) Giving tithes guarantees exemption from all earthly illnesses</span>
                  </label>
                </div>
                <div class="quiz-feedback" id="feedback-q1"></div>
              </div>

              <!-- Question 2 -->
              <div class="quiz-question-card" data-q="2" data-correct="c">
                <div class="quiz-q-num">Question 2 of 4</div>
                <p class="quiz-q-text">In Galatians 1:8-9, what does the Apostle Paul declare regarding anyone—even an angel from heaven—who preaches a different gospel?</p>
                <div class="quiz-options">
                  <label class="quiz-option-label">
                    <input type="radio" name="q2" value="a">
                    <span>A) They should be tolerated if their church attendance is large</span>
                  </label>
                  <label class="quiz-option-label">
                    <input type="radio" name="q2" value="b">
                    <span>B) They merely have a different cultural perspective</span>
                  </label>
                  <label class="quiz-option-label">
                    <input type="radio" name="q2" value="c">
                    <span>C) Let them be accursed (anathema)</span>
                  </label>
                  <label class="quiz-option-label">
                    <input type="radio" name="q2" value="d">
                    <span>D) They should be appointed as church treasurers</span>
                  </label>
                </div>
                <div class="quiz-feedback" id="feedback-q2"></div>
              </div>

              <!-- Question 3 -->
              <div class="quiz-question-card" data-q="3" data-correct="a">
                <div class="quiz-q-num">Question 3 of 4</div>
                <p class="quiz-q-text">What is the biblical doctrine of Justification by Faith (Romans 3:28)?</p>
                <div class="quiz-options">
                  <label class="quiz-option-label">
                    <input type="radio" name="q3" value="a">
                    <span>A) God declares the ungodly righteous based solely on Christ's imputed righteousness received through faith, not works</span>
                  </label>
                  <label class="quiz-option-label">
                    <input type="radio" name="q3" value="b">
                    <span>B) Man becomes righteous gradually through fasting and financial donations</span>
                  </label>
                  <label class="quiz-option-label">
                    <input type="radio" name="q3" value="c">
                    <span>C) All humans are automatically saved regardless of repentance</span>
                  </label>
                  <label class="quiz-option-label">
                    <input type="radio" name="q3" value="d">
                    <span>D) Righteousness is earned by keeping the Mosaic ceremonial food laws</span>
                  </label>
                </div>
                <div class="quiz-feedback" id="feedback-q3"></div>
              </div>

              <!-- Question 4 -->
              <div class="quiz-question-card" data-q="4" data-correct="b">
                <div class="quiz-q-num">Question 4 of 4</div>
                <p class="quiz-q-text">How should a pastor respond when popular media preaches that financial contributions guarantee divine healing?</p>
                <div class="quiz-options">
                  <label class="quiz-option-label">
                    <input type="radio" name="q4" value="a">
                    <span>A) Adopt the strategy to help raise church construction funds</span>
                  </label>
                  <label class="quiz-option-label">
                    <input type="radio" name="q4" value="b">
                    <span>B) Faithfully preach Christ's free gift of grace, exposing the error with humility, love, and sound biblical exegesis</span>
                  </label>
                  <label class="quiz-option-label">
                    <input type="radio" name="q4" value="c">
                    <span>C) Remain silent to avoid controversy with neighbouring denominations</span>
                  </label>
                  <label class="quiz-option-label">
                    <input type="radio" name="q4" value="d">
                    <span>D) Advise members to stop reading their Bibles</span>
                  </label>
                </div>
                <div class="quiz-feedback" id="feedback-q4"></div>
              </div>

              <div class="quiz-submit-box">
                <button type="button" class="btn btn-primary" id="btnSubmitQuiz">Submit Quiz Answers</button>
                <span id="quizScoreDisplay" class="quiz-score-display" style="display:none;"></span>
              </div>
            </form>
          `
        },
        {
          id: '2-5',
          type: 'doc',
          title: 'Unit 1 Conclusion',
          subtitle: 'Summary & pastoral prayer',
          bannerTitle: 'Unit 1 Conclusion',
          contentHtml: `
            <h3>Unit 1 Conclusion &amp; Pastoral Reflection</h3>
            <p>Congratulations on completing Unit 1! You have reaffirmed the sovereign foundation of the Christian faith. The gospel is good news about what God has accomplished in Jesus Christ, not advice about what man must achieve.</p>

            <div class="doctrinal-summary-card">
              <h4>Key Theological Summary</h4>
              <ul>
                <li><strong>The Cross is Sufficient:</strong> Christ's cry <em>"Tetelestai"</em> (It is finished - John 19:30) leaves no room for human transactional bargaining.</li>
                <li><strong>Uncompromising Exegesis:</strong> Faithful shepherds refuse to distort God's Word for personal popularity or financial enrichment.</li>
                <li><strong>Grace Over Merchandise:</strong> The church is the household of God, not a commercial marketplace.</li>
              </ul>
            </div>

            <div class="pastoral-benediction-box">
              <h4>Pastoral Benediction &amp; Prayer</h4>
              <p><em>"Now to him who is able to keep you from stumbling and to present you blameless before the presence of his glory with great joy, to the only God, our Savior, through Jesus Christ our Lord, be glory, majesty, dominion, and authority, before all time and now and forever. Amen." (Jude 1:24-25)</em></p>
            </div>
          `
        }
      ]
    },

    // Module 3: Unit 2: The Dangers of Prosperity Theology
    3: {
      topics: [
        {
          id: '3-1',
          type: 'doc',
          title: 'Unit 2 Overview',
          subtitle: 'Orientation & objectives',
          bannerTitle: 'Unit 2 Overview',
          contentHtml: `
            <h3>Welcome to Unit 2: The Dangers of Prosperity Theology</h3>
            <p>In this unit, we dissect the historical roots, theological fallacies, and spiritual damage caused by the Prosperity Gospel (also known as Word of Faith or Health and Wealth theology) across the African continent.</p>

            <div class="scripture-focus-box">
              <h4>Maandiko ya Msingi (Scriptural Foundation)</h4>
              <p><strong>1 Timothy 6:6-10:</strong> <em>"Now there is great gain in godliness with contentment, for we brought nothing into the world, and we cannot take anything out of the world... But those who desire to be rich fall into temptation, into a snare... For the love of money is a root of all kinds of evils."</em></p>
              <p><strong>2 Peter 2:1-3:</strong> <em>"In their greed they will exploit you with false words. Their condemnation from long ago is not idle."</em></p>
            </div>

            <h4>Core Unit Goals</h4>
            <ul>
              <li>Trace the origin of prosperity dogma from American New Thought into African urban and rural parishes.</li>
              <li>Examine how proof-texting (ripping verses out of context) distorts promises given to Abraham or Old Testament Israel.</li>
              <li>Equip pastors to preach contentment in Christ regardless of economic hardship.</li>
            </ul>
          `
        },
        {
          id: '3-2',
          type: 'doc',
          title: 'Unit 2 Reading Assignment',
          subtitle: 'Hermeneutics reading',
          bannerTitle: 'Unit 2 Reading Assignment',
          contentHtml: `
            <h3>Required Readings for Unit 2</h3>
            <p>Read 1 Timothy 6, 2 Timothy 4:1-5, and excerpts from the Lausanne Movement Theology Working Group report: <em>"A Statement on the Prosperity Gospel"</em>.</p>
            <div class="reading-card">
              <h4>Historical Analysis: The Seed-Faith Deception</h4>
              <p>Notice how 2 Corinthians 9:6-10 is frequently weaponized to extract money from impoverished believers. In its original historical context, Paul was collecting famine relief for suffering Jewish believers in Jerusalem—not telling Corinthian believers they would become multimillionaires!</p>
            </div>
          `
        },
        {
          id: '3-3',
          type: 'assignment',
          title: 'Assignment Activity Unit 2',
          subtitle: 'Due: Oct 22, 2026',
          dueDate: 'Oct 22, 2026',
          bannerTitle: 'Assignment Activity Unit 2',
          contentHtml: `
            <div class="assignment-header-meta">
              <span class="due-badge">📅 Due Date: Oct 22, 2026 at 11:59 PM EAT</span>
              <span class="points-badge">Graded: 100 Points</span>
            </div>
            <h3>Homiletic Exegesis: 1 Timothy 6:6-10</h3>
            <p>Write an expository sermon outline on 1 Timothy 6:6-10 titled: <strong>"Godliness with Contentment."</strong> Include: (1) Main Theological Idea, (2) Three Sermon Divisions, (3) Practical application for families struggling with economic hardship.</p>
          `
        },
        {
          id: '3-4',
          type: 'quiz',
          title: 'Self-Quiz Unit 2',
          subtitle: 'Due: Oct 22, 2026',
          dueDate: 'Oct 22, 2026',
          bannerTitle: 'Self-Quiz Unit 2',
          contentHtml: `
            <h3>Unit 2 Self-Assessment Quiz</h3>
            <p>Test your discernment on prosperity theology vs biblical stewardship.</p>
          `
        },
        {
          id: '3-5',
          type: 'doc',
          title: 'Unit 2 Conclusion',
          subtitle: 'Pastoral summary',
          bannerTitle: 'Unit 2 Conclusion',
          contentHtml: `
            <h3>Unit 2 Conclusion</h3>
            <p>True shepherds do not fleece the sheep; they feed and protect them. May the Lord grant you courage to preach contentment and true eternal treasure in Christ.</p>
          `
        }
      ]
    },

    // Module 4: Unit 3: Grace, Repentance & Salvation
    4: {
      topics: [
        {
          id: '4-1',
          type: 'doc',
          title: 'Unit 3 Overview',
          subtitle: 'Orientation & objectives',
          bannerTitle: 'Unit 3 Overview',
          contentHtml: `
            <h3>Welcome to Unit 3: Grace, Repentance &amp; Salvation</h3>
            <p>Examine the relationship between genuine biblical repentance (Metanoia—change of mind and direction) and saving faith. Learn how to counsel souls experiencing conviction of sin.</p>
          `
        },
        {
          id: '4-2',
          type: 'doc',
          title: 'Unit 3 Reading Assignment',
          subtitle: 'Ephesians & Romans',
          bannerTitle: 'Unit 3 Reading Assignment',
          contentHtml: `
            <h3>Scripture Reading</h3>
            <p>Ephesians 2:1-10; Romans 5:1-11; Luke 15 (The Prodigal Son & The Father's Mercy).</p>
          `
        },
        {
          id: '4-3',
          type: 'assignment',
          title: 'Assignment Activity Unit 3',
          subtitle: 'Due: Oct 29, 2026',
          dueDate: 'Oct 29, 2026',
          bannerTitle: 'Assignment Activity Unit 3',
          contentHtml: `
            <h3>Pastoral Counseling Dialogue</h3>
            <p>Outline how you would counsel an elder who struggles with assurance of salvation.</p>
          `
        },
        {
          id: '4-4',
          type: 'quiz',
          title: 'Self-Quiz Unit 3',
          subtitle: 'Due: Oct 29, 2026',
          dueDate: 'Oct 29, 2026',
          bannerTitle: 'Self-Quiz Unit 3',
          contentHtml: `
            <h3>Unit 3 Self-Quiz</h3>
            <p>Evaluate your understanding of Soteriology (the doctrine of salvation).</p>
          `
        },
        {
          id: '4-5',
          type: 'doc',
          title: 'Unit 3 Conclusion',
          subtitle: 'Pastoral reflection',
          bannerTitle: 'Unit 3 Conclusion',
          contentHtml: `
            <h3>Unit 3 Conclusion</h3>
            <p>Salvation is from beginning to end a work of God's sovereign grace. We preach with urgency knowing the Holy Spirit regenerates hearts.</p>
          `
        }
      ]
    },

    // Module 5: Unit 4: Suffering, Faith & God's Sovereignty
    5: {
      topics: [
        {
          id: '5-1',
          type: 'doc',
          title: 'Unit 4 Overview',
          subtitle: 'Theology of suffering',
          bannerTitle: 'Unit 4 Overview',
          contentHtml: `
            <h3>Welcome to Unit 4: Suffering, Faith &amp; God's Sovereignty</h3>
            <p>Where is God when tragedy strikes? Why do godly believers face sickness and loss? In this unit, we explore biblical theodicy through the books of Job, Habakkuk, and 1 Peter.</p>
          `
        },
        {
          id: '5-2',
          type: 'doc',
          title: 'Unit 4 Reading Assignment',
          subtitle: '1 Peter & Romans 8',
          bannerTitle: 'Unit 4 Reading Assignment',
          contentHtml: `
            <h3>Readings: The Fiery Trial</h3>
            <p>1 Peter 4:12-19; 2 Corinthians 12:7-10 (Paul's Thorn in the Flesh); Romans 8:18-39.</p>
          `
        },
        {
          id: '5-3',
          type: 'assignment',
          title: 'Assignment Activity Unit 4',
          subtitle: 'Due: Nov 5, 2026',
          dueDate: 'Nov 5, 2026',
          bannerTitle: 'Assignment Activity Unit 4',
          contentHtml: `
            <h3>Hospital &amp; Bereavement Ministry Guide</h3>
            <p>Draft a sensitive pastoral visitation guide for church leaders visiting grieving families.</p>
          `
        },
        {
          id: '5-4',
          type: 'quiz',
          title: 'Self-Quiz Unit 4',
          subtitle: 'Due: Nov 5, 2026',
          dueDate: 'Nov 5, 2026',
          bannerTitle: 'Self-Quiz Unit 4',
          contentHtml: `
            <h3>Unit 4 Self-Quiz</h3>
            <p>Review key truths regarding God's sovereignty and Christian perseverance in affliction.</p>
          `
        },
        {
          id: '5-5',
          type: 'doc',
          title: 'Unit 4 Conclusion',
          subtitle: 'Pastoral blessing',
          bannerTitle: 'Unit 4 Conclusion',
          contentHtml: `
            <h3>Unit 4 Conclusion</h3>
            <p>God uses trials to refine our faith as pure gold. Comfort your flock with the hope of the resurrection.</p>
          `
        }
      ]
    },

    // Module 6: Unit 5: Teaching Sound Doctrine in Your Church
    6: {
      topics: [
        {
          id: '6-1',
          type: 'doc',
          title: 'Unit 5 Overview',
          subtitle: 'Pastoral leadership',
          bannerTitle: 'Unit 5 Overview',
          contentHtml: `
            <h3>Welcome to Unit 5: Teaching Sound Doctrine in Your Church</h3>
            <p>How to systematically reform your local congregation's teaching ministry, Sunday School, and discipleship curriculum toward biblical fidelity.</p>
          `
        },
        {
          id: '6-2',
          type: 'doc',
          title: 'Unit 5 Reading Assignment',
          subtitle: 'Titus & 1 Timothy',
          bannerTitle: 'Unit 5 Reading Assignment',
          contentHtml: `
            <h3>Pastoral Epistles</h3>
            <p>Titus 1 & 2; 1 Timothy 3:1-13; 2 Timothy 2:1-7.</p>
          `
        },
        {
          id: '6-3',
          type: 'assignment',
          title: 'Assignment Activity Unit 5',
          subtitle: 'Due: Nov 12, 2026',
          dueDate: 'Nov 12, 2026',
          bannerTitle: 'Assignment Activity Unit 5',
          contentHtml: `
            <h3>1-Year Church Teaching Curriculum Plan</h3>
            <p>Construct a 12-month preaching and Sunday School roadmap for your local assembly.</p>
          `
        },
        {
          id: '6-4',
          type: 'quiz',
          title: 'Self-Quiz Unit 5',
          subtitle: 'Due: Nov 12, 2026',
          dueDate: 'Nov 12, 2026',
          bannerTitle: 'Self-Quiz Unit 5',
          contentHtml: `
            <h3>Unit 5 Comprehensive Assessment</h3>
            <p>Evaluate your complete pastoral strategy for guarding sound doctrine.</p>
          `
        },
        {
          id: '6-5',
          type: 'doc',
          title: 'Unit 5 Conclusion',
          subtitle: 'Course graduation & commissioning',
          bannerTitle: 'Course Commissioning',
          contentHtml: `
            <h3>Course Commissioning</h3>
            <p>You have fought the good fight of sound theology in this course. Go forth and shepherd the flock of God that is among you with fidelity and joy!</p>
          `
        }
      ]
    }
  }
};

/**
 * Returns structured modules with their topics for a given course.
 * If specific custom topics aren't set for another course, generates default Brightspace-style topics.
 */
function getCourseModulesWithTopics(course) {
  const courseId = course.id;
  const customCourse = courseContent[courseId] || {};

  return (course.modules || []).map(mod => {
    const modCustom = customCourse[mod.id];
    let topics = [];

    if (modCustom && modCustom.topics) {
      topics = modCustom.topics;
    } else {
      // Standard UoPeople Brightspace pattern for units
      const unitNum = mod.sort_order - 1;
      const isIntro = mod.sort_order === 1;

      if (isIntro) {
        topics = [
          {
            id: `${mod.id}-1`,
            type: 'doc',
            title: `${mod.title} - Syllabus & Guide`,
            subtitle: 'Required reading',
            bannerTitle: `${mod.title} Overview`,
            contentHtml: `
              <h3>Welcome to ${course.title}</h3>
              <p>Welcome to this foundational pastoral ministry course. This course is designed to equip church leaders with solid biblical insights, practical shepherding skills, and faithful exegetical tools.</p>
              <h4>Course Schedule &amp; Format</h4>
              <p>Each unit covers an overview, assigned readings, practical church ministry activity, and a self-check evaluation.</p>
            `
          },
          {
            id: `${mod.id}-2`,
            type: 'doc',
            title: 'Faculty Introduction & Instructions',
            subtitle: 'Course orientation',
            bannerTitle: 'Faculty Introduction',
            contentHtml: `
              <h3>Meet Your Pastoral Instructors</h3>
              <p>Our faculty members are experienced pastors and theologians serving in local congregations across East Africa. We are here to support your learning journey.</p>
            `
          }
        ];
      } else {
        topics = [
          {
            id: `${mod.id}-1`,
            type: 'doc',
            title: `Unit ${unitNum} Overview`,
            subtitle: 'Orientation & objectives',
            bannerTitle: `Unit ${unitNum} Overview`,
            contentHtml: `
              <h3>Welcome to Unit ${unitNum}: ${mod.title}</h3>
              <p>In this unit, you will study the foundational principles of <em>${mod.title}</em>, examining Holy Scripture and its direct application to church leadership in Kenya and East Africa.</p>
              <h4>Unit Learning Objectives</h4>
              <ul>
                <li>Understand the biblical texts and theological basis of this topic.</li>
                <li>Apply faithful principles to shepherd your congregation with wisdom.</li>
                <li>Participate in cohort discussions with fellow pastors.</li>
              </ul>
            `
          },
          {
            id: `${mod.id}-2`,
            type: 'doc',
            title: `Unit ${unitNum} Reading Assignment`,
            subtitle: 'Prescribed reading',
            bannerTitle: `Unit ${unitNum} Reading Assignment`,
            contentHtml: `
              <h3>Assigned Readings for Unit ${unitNum}</h3>
              <p>Study the following scripture passages and commentary excerpts carefully. Make notes in your study journal.</p>
            `
          },
          {
            id: `${mod.id}-3`,
            type: 'assignment',
            title: `Assignment Activity Unit ${unitNum}`,
            subtitle: 'Due in 7 days',
            dueDate: 'Due: Oct 2026',
            bannerTitle: `Assignment Activity Unit ${unitNum}`,
            contentHtml: `
              <div class="assignment-header-meta">
                <span class="due-badge">📅 Due: Term Schedule</span>
                <span class="points-badge">Graded: 100 Points</span>
              </div>
              <h3>Pastoral Ministry Application</h3>
              <p>Apply the principles from this unit to your local church setting. Write a short sermon reflection or counseling case study.</p>
            `
          },
          {
            id: `${mod.id}-4`,
            type: 'quiz',
            title: `Self-Quiz Unit ${unitNum}`,
            subtitle: 'Due in 7 days',
            dueDate: 'Due: Oct 2026',
            bannerTitle: `Self-Quiz Unit ${unitNum}`,
            contentHtml: `
              <h3>Self-Quiz Unit ${unitNum}</h3>
              <p>Answer the self-check questions to verify your understanding before moving forward.</p>
            `
          },
          {
            id: `${mod.id}-5`,
            type: 'doc',
            title: `Unit ${unitNum} Conclusion`,
            subtitle: 'Pastoral summary',
            bannerTitle: `Unit ${unitNum} Conclusion`,
            contentHtml: `
              <h3>Unit ${unitNum} Summary &amp; Prayer</h3>
              <p>You have completed the key learning requirements for Unit ${unitNum}. Continue to meditate on God's Word as you prepare for the next unit.</p>
            `
          }
        ];
      }
    }

    return {
      ...mod,
      topics
    };
  });
}

module.exports = {
  courseContent,
  getCourseModulesWithTopics
};
