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

            <div class="interactive-submission-area" data-submission-type="assignment" data-max-score="100">
              <h4>Your Assignment Submission:</h4>
              <p class="sub-help">Type or paste your response below. You may save a draft or submit directly for faculty grading.</p>
              <textarea id="assignmentInput" class="assignment-textarea" rows="8" placeholder="Type your pastoral evaluation here... (e.g., In addressing the visiting speaker's claims, Scripture is unambiguous...)"></textarea>
              <label class="integrity-pledge-box" for="integrityPledgeCheck">
                <input type="checkbox" id="integrityPledgeCheck" class="integrity-pledge-input" required>
                <span><strong>Academic Honesty Pledge:</strong> I affirm before the Lord that this reflection is my own original pastoral work and not copied from another student or source without citation.</span>
              </label>
              <div class="submission-actions">
                <button type="button" class="btn btn-outline" id="btnSaveAssignmentDraft" onclick="alert('Draft saved locally to your device.')">Save Draft</button>
                <button type="button" class="btn btn-primary" id="btnSubmitAssignment">Submit for Faculty Evaluation</button>
              </div>
              <div id="assignmentSuccessMsg" class="assignment-success" style="display: none;">
                ✓ <strong>Assignment Successfully Submitted!</strong> Your faculty mentor Dr. Mwangi will review your theological case study within 48 hours.
              </div>
              <div id="assignmentGradeBox" class="assignment-grade-box" hidden></div>
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

const { getCustomLessonsSync } = require('../utils/lms-store');

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getEastAfricaDateIso() {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Africa/Nairobi',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(new Date());
  } catch {
    return new Date(Date.now() + 3 * 3600 * 1000).toISOString().slice(0, 10);
  }
}

function stripQuizAnswerKeys(html) {
  return String(html || '').replace(/\s+data-correct\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');
}

function extractQuestionsFromHtml(html) {
  const source = String(html || '');
  const questions = [];
  const tagRegex = /<div\b([^>]*\bclass\s*=\s*["'][^"']*quiz-question-card[^"']*["'][^>]*)>/gi;
  let match;
  while ((match = tagRegex.exec(source)) !== null) {
    const attrs = match[1] || '';
    const qMatch = attrs.match(/\bdata-q\s*=\s*["']?(\d+)["']?/i);
    const cMatch = attrs.match(/\bdata-correct\s*=\s*["']?([a-d])["']?/i);
    if (qMatch && cMatch) {
      questions.push({
        qNum: Number(qMatch[1]),
        correct: String(cMatch[1]).toLowerCase()
      });
    }
  }
  return questions;
}

const INTEGRITY_PLEDGE_HTML = `
  <label class="integrity-pledge-box" for="integrityPledgeCheck">
    <input type="checkbox" id="integrityPledgeCheck" class="integrity-pledge-input" required>
    <span><strong>Academic Honesty Pledge:</strong> I affirm before the Lord that this reflection is my own original pastoral work and not copied from another student or source without citation.</span>
  </label>`;

function buildCustomLessonHtml(lesson) {
  const safeTitle = escapeHtml(lesson.title);
  const safeScripture = escapeHtml(lesson.scripture_ref);
  const bodyHtml = lesson.content_html || '';

  let html = '';
  if (lesson.due_date || lesson.max_score || lesson.is_practice || lesson.min_progress_to_unlock) {
    html += `<div class="assignment-header-meta">`;
    if (lesson.due_date) html += `<span class="due-badge">📅 Due: ${escapeHtml(lesson.due_date)}</span>`;
    if (lesson.topic_type === 'quiz' && lesson.is_practice) {
      html += `<span class="due-badge">Practice Self-Quiz (Unlimited Attempts • Ungraded)</span>`;
    } else if (['assignment', 'journal', 'quiz', 'exam'].includes(lesson.topic_type)) {
      html += `<span class="points-badge">Graded: ${Number(lesson.max_score) || 100} Points</span>`;
    }
    if (lesson.topic_type === 'exam' && lesson.time_limit_minutes) {
      html += `<span class="due-badge">⏱️ Time Limit: ${Number(lesson.time_limit_minutes)} min</span>`;
    }
    if (lesson.topic_type === 'exam' && Number(lesson.min_progress_to_unlock) > 0) {
      html += `<span class="points-badge">Requires ${Number(lesson.min_progress_to_unlock)}% Coursework</span>`;
    }
    if ((lesson.topic_type === 'quiz' && !lesson.is_practice || lesson.topic_type === 'exam') && lesson.max_attempts) {
      html += `<span class="points-badge">Max Attempts: ${Number(lesson.max_attempts)}</span>`;
    }
    html += `</div>`;
  }

  html += `<h3>${safeTitle}</h3>`;
  if (safeScripture) {
    html += `<div class="scripture-focus-box"><strong>📖 Key Scripture:</strong> ${safeScripture}</div>`;
  }
  html += `<div class="custom-lesson-body">${bodyHtml}</div>`;

  if (lesson.topic_type === 'assignment' || lesson.topic_type === 'journal') {
    const label = lesson.topic_type === 'journal' ? 'Your Learning Journal Entry' : 'Your Written Submission';
    const privacyBanner = lesson.topic_type === 'journal'
      ? `<div class="journal-privacy-note">🔒 <strong>Private Ministry Journal:</strong> Your reflection is strictly private between you and your assigned instructor. Classmates cannot see your journal entries.</div>`
      : '';
    html += `
      <div class="assignment-submission-box" data-submission-type="${lesson.topic_type}" data-max-score="${Number(lesson.max_score) || 100}">
        <h4>✍️ ${label}</h4>
        ${privacyBanner}
        <textarea id="assignmentInput" class="assignment-textarea" rows="7" placeholder="Type your pastoral reflection or assignment response here..."></textarea>
        ${INTEGRITY_PLEDGE_HTML}
        <div class="assignment-actions-row">
          <button type="button" class="btn btn-primary" id="btnSubmitAssignment">Submit to Instructor</button>
          <span id="assignmentSuccessMsg" class="assignment-saved-msg" style="display:none;">✓ Saved and sent to your instructor for grading!</span>
        </div>
        <div id="assignmentGradeBox" class="assignment-grade-box" hidden></div>
      </div>`;
  } else if (lesson.topic_type === 'quiz' || lesson.topic_type === 'exam') {
    const questions = Array.isArray(lesson.quiz_questions) ? lesson.quiz_questions : [];
    const timerAttr = lesson.time_limit_minutes ? `data-time-limit="${Number(lesson.time_limit_minutes)}"` : '';
    const isPractice = Boolean(lesson.topic_type === 'quiz' && lesson.is_practice);
    const maxAttemptsAttr = isPractice ? '' : `data-max-attempts="${Number(lesson.max_attempts) || (lesson.topic_type === 'exam' ? 1 : 3)}"`;
    const practiceAttr = isPractice ? `data-is-practice="true"` : '';
    const passAttr = `data-pass-score="${Number(lesson.pass_score) || 60}"`;
    const maxScoreAttr = `data-max-score="${Number(lesson.max_score) || 100}"`;
    html += `<div class="graded-quiz-wrapper" data-quiz-type="${lesson.topic_type}" ${practiceAttr} ${timerAttr} ${maxAttemptsAttr} ${passAttr} ${maxScoreAttr}>`;
    if (lesson.time_limit_minutes) {
      html += `<div class="quiz-timer-bar" id="quizTimerBar">⏱️ Time Remaining: <strong id="quizTimerDisplay">${Number(lesson.time_limit_minutes)}:00</strong></div>`;
    }
    if (questions.length === 0) {
      html += `<p>No questions have been added to this assessment yet.</p>`;
    } else {
      questions.forEach((q, idx) => {
        const qNum = idx + 1;
        const correct = String(q.correct || 'a').toLowerCase();
        html += `<div class="quiz-question-card" data-q="${qNum}" data-correct="${escapeHtml(correct)}">`;
        html += `<p class="quiz-q-title"><strong>Q${qNum}.</strong> ${escapeHtml(q.prompt)}</p>`;
        ['a', 'b', 'c', 'd'].forEach(letter => {
          const optText = q.options && q.options[letter];
          if (optText) {
            html += `<label class="quiz-option-label"><input type="radio" name="q${qNum}" value="${letter}"> <span><strong>${letter.toUpperCase()}.</strong> ${escapeHtml(optText)}</span></label>`;
          }
        });
        html += `<div class="quiz-feedback" id="feedback-q${qNum}"></div>`;
        html += `</div>`;
      });
      const btnText = lesson.topic_type === 'exam'
        ? 'Submit Final Exam'
        : (isPractice ? 'Check Practice Answers' : 'Submit Graded Quiz');
      html += `<div class="quiz-submit-row">
        <button type="button" class="btn btn-primary" id="btnSubmitQuiz">${btnText}</button>
        <span id="quizScoreDisplay" class="quiz-score-badge" style="display:none;"></span>
      </div>`;
    }
    html += `</div>`;
  } else if (lesson.topic_type === 'discussion') {
    html += `
      <div class="discussion-prompt-cta">
        <p>Join your fellow pastors in the <strong>Cohort Discussion Forum</strong> to post your response and reply to peers.</p>
        <button type="button" class="btn btn-primary btn-open-discussions">Open Cohort Discussion Forum &rarr;</button>
      </div>`;
  }

  return html;
}

/**
 * Returns structured modules with their topics for a given course.
 * Merges browser-authored custom lessons & quizzes from data/custom-lessons.json.
 * By default strips quiz answer keys (`data-correct`) before rendering to student browsers.
 */
function getCourseModulesWithTopics(course, options = {}) {
  const includeAnswerKeys = Boolean(options.includeAnswerKeys);
  const courseId = course.id;
  const customCourse = courseContent[courseId] || {};
  const todayIso = getEastAfricaDateIso();

  return (course.modules || []).map(mod => {
    const modCustom = customCourse[mod.id];
    const authoredLessons = getCustomLessonsSync(courseId, mod.id);
    const modDueIso = (mod.due_date && /^\d{4}-\d{2}-\d{2}$/.test(String(mod.due_date).trim()))
      ? String(mod.due_date).trim()
      : null;
    let topics = [];

    if (modCustom && modCustom.topics) {
      topics = modCustom.topics.map(t => ({ ...t }));
    } else if (authoredLessons.length > 0) {
      topics = [];
    } else {
      // Standard UoPeople Brightspace pattern for units
      const unitNum = (mod.sort_order || 1) - 1;
      const isIntro = (mod.sort_order || 1) === 1;

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
              <p>Each unit covers an overview, assigned readings, cohort discussion, practical church ministry activity, and a graded evaluation.</p>
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
              <p>Our faculty members are experienced pastors and theologians serving in local congregations across East Africa. Use the WhatsApp or Email buttons above whenever you need guidance.</p>
            `
          }
        ];
      } else {
        const dueLabel = mod.due_date ? `Due: ${mod.due_date}` : 'Due: Term Schedule';
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
              <p>Study the prescribed scripture passages and course commentary carefully. Record key ministry applications in your learning journal.</p>
            `
          },
          {
            id: `${mod.id}-3`,
            type: 'assignment',
            title: `Assignment Activity Unit ${unitNum}`,
            subtitle: dueLabel,
            dueDate: dueLabel,
            bannerTitle: `Assignment Activity Unit ${unitNum}`,
            contentHtml: `
              <div class="assignment-header-meta">
                <span class="due-badge">📅 ${dueLabel}</span>
                <span class="points-badge">Graded: 100 Points</span>
              </div>
              <h3>Pastoral Ministry Application</h3>
              <p>Apply the principles from this unit to your local church setting. Write a practical pastoral reflection or ministry plan and submit it to your instructor.</p>
            `
          },
          {
            id: `${mod.id}-4`,
            type: 'quiz',
            title: `Self-Quiz Unit ${unitNum}`,
            subtitle: dueLabel,
            dueDate: dueLabel,
            bannerTitle: `Self-Quiz Unit ${unitNum}`,
            contentHtml: `
              <h3>Self-Quiz Unit ${unitNum}</h3>
              <p>Answer the check questions below to confirm your understanding of this unit.</p>
              <div class="quiz-question-card" data-q="1" data-correct="b">
                <p class="quiz-q-title"><strong>Q1.</strong> What is the primary authority for Christian pastoral leadership and teaching?</p>
                <label class="quiz-option-label"><input type="radio" name="q1" value="a"> <span><strong>A.</strong> Popular cultural trends</span></label>
                <label class="quiz-option-label"><input type="radio" name="q1" value="b"> <span><strong>B.</strong> Holy Scripture faithfully interpreted</span></label>
                <label class="quiz-option-label"><input type="radio" name="q1" value="c"> <span><strong>C.</strong> Personal opinions alone</span></label>
                <div class="quiz-feedback" id="feedback-q1"></div>
              </div>
              <div class="quiz-question-card" data-q="2" data-correct="a">
                <p class="quiz-q-title"><strong>Q2.</strong> How should a pastor apply biblical lessons from ${escapeHtml(mod.title)}?</p>
                <label class="quiz-option-label"><input type="radio" name="q2" value="a"> <span><strong>A.</strong> Through humble teaching, prayer, and practical care for the flock</span></label>
                <label class="quiz-option-label"><input type="radio" name="q2" value="b"> <span><strong>B.</strong> Keeping knowledge strictly theoretical</span></label>
                <label class="quiz-option-label"><input type="radio" name="q2" value="c"> <span><strong>C.</strong> Avoiding accountability in the local church</span></label>
                <div class="quiz-feedback" id="feedback-q2"></div>
              </div>
              <div class="quiz-submit-row">
                <button type="button" class="btn btn-primary" id="btnSubmitQuiz">Submit Quiz</button>
                <span id="quizScoreDisplay" class="quiz-score-badge" style="display:none;"></span>
              </div>
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

    // Ensure every built-in assignment topic has a live submission form + pledge
    topics = topics.map(t => {
      if (t.type === 'assignment' && t.contentHtml && !t.contentHtml.includes('id="assignmentInput"')) {
        return {
          ...t,
          contentHtml: t.contentHtml + `
            <div class="assignment-submission-box" data-submission-type="assignment" data-max-score="100">
              <h4>✍️ Your Written Submission</h4>
              <textarea id="assignmentInput" class="assignment-textarea" rows="7" placeholder="Write your pastoral reflection or assignment response here..."></textarea>
              ${INTEGRITY_PLEDGE_HTML}
              <div class="assignment-actions-row">
                <button type="button" class="btn btn-primary" id="btnSubmitAssignment">Submit to Instructor</button>
                <span id="assignmentSuccessMsg" class="assignment-saved-msg" style="display:none;">✓ Saved and sent to your instructor for grading!</span>
              </div>
              <div id="assignmentGradeBox" class="assignment-grade-box" hidden></div>
            </div>`
        };
      }
      return t;
    });

    // Append any browser-authored lessons/quizzes/exams for this module
    if (authoredLessons.length > 0) {
      const mappedCustom = authoredLessons.map(lesson => ({
        id: lesson.topic_key,
        type: lesson.topic_type === 'reading' ? 'doc' : lesson.topic_type,
        title: lesson.title,
        subtitle: lesson.due_date ? `Due: ${lesson.due_date}` : (lesson.topic_type === 'exam' ? 'Graded Exam' : 'Lesson'),
        dueDate: lesson.due_date || '',
        dueDateIso: (lesson.due_date && /^\d{4}-\d{2}-\d{2}$/.test(String(lesson.due_date).trim()))
          ? String(lesson.due_date).trim()
          : modDueIso,
        bannerTitle: lesson.banner_title || lesson.title,
        maxScore: lesson.max_score || 100,
        passScore: lesson.pass_score || 60,
        maxAttempts: lesson.max_attempts || (lesson.topic_type === 'exam' ? 1 : 3),
        timeLimitMinutes: lesson.time_limit_minutes || null,
        isPractice: Boolean(lesson.topic_type === 'quiz' && lesson.is_practice),
        minProgressToUnlock: Number(lesson.min_progress_to_unlock) >= 0 ? Number(lesson.min_progress_to_unlock) : (lesson.topic_type === 'exam' ? 70 : 0),
        isCustom: true,
        quizQuestions: Array.isArray(lesson.quiz_questions) ? lesson.quiz_questions : [],
        contentHtml: buildCustomLessonHtml(lesson)
      }));
      topics = topics.concat(mappedCustom);
    }

    // Normalize dueDateIso & question count metadata, then strip answer keys unless explicitly requested
    topics = topics.map(t => {
      const dueDateIso = t.dueDateIso || (
        (t.dueDate && /^\d{4}-\d{2}-\d{2}$/.test(String(t.dueDate).trim()))
          ? String(t.dueDate).trim()
          : modDueIso
      );
      const parsedQuestions = Array.isArray(t.quizQuestions) && t.quizQuestions.length > 0
        ? t.quizQuestions.length
        : extractQuestionsFromHtml(t.contentHtml).length;

      const cleaned = {
        ...t,
        dueDateIso: dueDateIso || null,
        questionCount: parsedQuestions,
        maxScore: Number(t.maxScore) > 0 ? Number(t.maxScore) : 100,
        passScore: Number(t.passScore) > 0 ? Number(t.passScore) : 60,
        maxAttempts: Number(t.maxAttempts) > 0 ? Number(t.maxAttempts) : 5,
        contentHtml: includeAnswerKeys ? t.contentHtml : stripQuizAnswerKeys(t.contentHtml)
      };
      delete cleaned.quizQuestions;
      return cleaned;
    });

    const isLocked = Boolean(mod.unlock_date && mod.unlock_date > todayIso);

    return {
      ...mod,
      isLocked,
      topics
    };
  });
}

/**
 * Authoritative server-side quiz/exam answer key lookup.
 */
function getQuizDefinition(course, moduleId, topicId) {
  if (!course) return null;
  const mods = getCourseModulesWithTopics(course, { includeAnswerKeys: true });
  const mod = mods.find(m => Number(m.id) === Number(moduleId));
  if (!mod) return null;
  const topic = (mod.topics || []).find(t => String(t.id) === String(topicId));
  if (!topic) return null;

  let questions = [];
  if (topic.isCustom) {
    const lessons = getCustomLessonsSync(course.id, mod.id);
    const lesson = lessons.find(l => String(l.topic_key) === String(topicId));
    if (lesson && Array.isArray(lesson.quiz_questions)) {
      questions = lesson.quiz_questions.map((q, idx) => ({
        qNum: idx + 1,
        correct: String(q.correct || 'a').toLowerCase()
      }));
    }
  }
  if (questions.length === 0) {
    questions = extractQuestionsFromHtml(topic.contentHtml);
  }

  return {
    mod,
    topic,
    questions,
    maxScore: Number(topic.maxScore) > 0 ? Number(topic.maxScore) : 100,
    passScore: Number(topic.passScore) > 0 ? Number(topic.passScore) : 60,
    maxAttempts: Number(topic.maxAttempts) > 0 ? Number(topic.maxAttempts) : (topic.type === 'exam' ? 1 : (topic.isCustom ? 3 : 5)),
    timeLimitMinutes: topic.timeLimitMinutes || null,
    dueDateIso: topic.dueDateIso || null,
    isPractice: Boolean(topic.isPractice),
    minProgressToUnlock: Number(topic.minProgressToUnlock) || 0,
    isExam: topic.type === 'exam'
  };
}

module.exports = {
  courseContent,
  stripQuizAnswerKeys,
  getQuizDefinition,
  getCourseModulesWithTopics
};
