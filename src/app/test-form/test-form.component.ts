import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { FormGroup, FormsModule, FormControl, ReactiveFormsModule } from '@angular/forms';
import { HttpClient, HttpParams, HttpHeaders } from '../../../node_modules/@angular/common/http';
import { OpenVidu, Session, Event, Stream, Subscriber, Publisher } from 'openvidu-browser'
import { query } from '../../../node_modules/@angular/core/src/render3/query';

@Component({
  selector: 'app-test-form',
  templateUrl: './test-form.component.html',
  styleUrls: ['./test-form.component.css']
})
export class TestFormComponent implements OnInit {
  form: FormGroup;
  OV: OpenVidu;
  token: string;
  statuses: string[] = [];
  session: Session;
  time: Date = new Date();
  talking: boolean;
  participantTalking : boolean;
  subscriber : Subscriber;
  publisher : Publisher;
  myStream: Stream;
  streams: Stream[] = [];
  scenario: string = '';
  constructor(
    private httpClient: HttpClient,
    private cdRef : ChangeDetectorRef
  ) { }

  ngOnInit() {
    this.createSession("tester").then(() => {
      this.createToken("tester").then((token: string) => {
        this.time = new Date();
        this.statuses.push("base time at: " + new Date().getSeconds() + ":" + new Date().getMilliseconds());
        this.OV = new OpenVidu();
        this.session = this.OV.initSession();
        // On every new Stream received...

        this.session.connect(token).then(() => {
          this.statuses.push("room connect at: " + new Date().getSeconds() + ":" + new Date().getMilliseconds() + " +" + (new Date().getTime() - this.time.getTime()));


        });

      });
    });

  }
  toggleTalking() {
    if (!this.talking) {
      this.statuses.push("pushed to talk at: " + new Date().getSeconds() + ":" + new Date().getMilliseconds());
      this.talking = true;
      if (this.scenario == '1') {

        this.publisher = this.OV.initPublisher('participants', {
          audioSource: undefined, // The source of audio. If undefined default audio input
          videoSource: undefined, // The source of video. If undefined default video input
          publishAudio: true,     // Whether to start publishing with your audio unmuted or not
          publishVideo: false,     // Whether to start publishing with your video enabled or not
          resolution: '200x200',  // The resolution of your video
          frameRate: 30,          // The frame rate of your video
          insertMode: 'APPEND',   // How the video is inserted in target element 'video-container'
          mirror: false            // Whether to mirror your local video or not
        });
  
        this.session.publish(this.publisher);
      } else {
        
        this.session.signal({
          data: this.myStream.streamId,  // Any string (optional)
          to: [],                     // Array of Connection objects (optional. Broadcast to everyone if empty)
          type: 'startTalking'             // The type of message (optional)
        })
          .then(() => {
            console.log('Message successfully sent');
          })
          .catch(error => {
            console.error(error);
          });
      }
    } else {

      this.talking = false;
      if (this.scenario == '1') {
        this.session.unpublish(this.publisher);
      } else {
        this.session.signal({
          data: this.myStream.streamId,  // Any string (optional)
          to: [],                     // Array of Connection objects (optional. Broadcast to everyone if empty)
          type: 'stopTalking'             // The type of message (optional)
        })
          .then(() => {
            console.log('Message successfully sent');
          })
          .catch(error => {
            console.error(error);
          });
      }
    }
  }
  chooseScenario(scenario: string) {
    var self = this;
    this.scenario = scenario;
    if (scenario == '1') {
      this.session.on('streamCreated', function (event: any) {
        self.participantTalking = true;
        self.subscriber = self.session.subscribe(event.stream, 'participants');
        self.subscriber.on('videoElementCreated', function (event: any) {
          self.statuses.push("receiving audio at: " + new Date().getSeconds() + ":" + new Date().getMilliseconds());
          event.element.setAttribute("style", "margin-left:20px;");
        });
        
      });
      this.session.on("streamDestroyed", function(event : any) {
        self.participantTalking = false;

      })

    } else {
      var publisher = this.OV.initPublisher('participants', {
        audioSource: undefined, // The source of audio. If undefined default audio input
        videoSource: undefined, // The source of video. If undefined default video input
        publishAudio: true,     // Whether to start publishing with your audio unmuted or not
        publishVideo: false,     // Whether to start publishing with your video enabled or not
        resolution: '200x200',  // The resolution of your video
        frameRate: 30,          // The frame rate of your video
        insertMode: 'APPEND',   // How the video is inserted in target element 'video-container'
        mirror: false            // Whether to mirror your local video or not
      });

      this.session.publish(publisher);
      //this.session.stream
      this.myStream = publisher.stream;
      Object.keys(this.session.remoteConnections).forEach((key : string) => {
        console.log("remtoe connection", this.session.remoteConnections[key]);
        if (this.session.remoteConnections[key].stream) {
          this.streams.push(this.session.remoteConnections[key].stream);
        }
      });
      this.session.on('streamCreated', function (event: any) {
        self.streams.push(event.stream);
        console.log("someone published: ", event.stream);
        /*
        var subscriber = this.session.subscribe(event.stream, 'participants');

        subscriber.on('videoElementCreated', function (event: any) {
          console.log("videoElementCreatedEvent", event);
          event.element.setAttribute("style", "margin-left:20px;");
        });
        */
      });
      this.session.on('signal:startTalking', (event: any) => {

        console.log(event.data); // Message
        console.log(event.from); // Connection object of the sender
        console.log(event.type); // The type of message ("my-chat")
        this.streams.forEach((stream: Stream) => {
          if (stream.streamId == event.data) {
            self.participantTalking = true;
            self.cdRef.detectChanges();
            self.subscriber = self.session.subscribe(stream, 'participants');
            self.subscriber.on('videoElementCreated', function (event: any) {
              self.statuses.push("receiving audio at: " + new Date().getSeconds() + ":" + new Date().getMilliseconds());
              console.log("videoElementCreatedEvent", event);
              event.element.setAttribute("style", "margin-left:20px;");
            });
          }

        });
      });
      this.session.on('signal:stopTalking', (event: any) => {
        self.participantTalking = false;
        self.cdRef.detectChanges();
        this.streams.forEach((stream: Stream) => {
          if (stream.streamId == event.data) {
            var subscriber = self.session.unsubscribe(self.subscriber);
          }
        });
      });

    }
  }
  createToken(sessionId): Promise<string> {
    return new Promise((resolve, reject) => {

      const body = JSON.stringify({ session: sessionId });
      const options = {
        headers: new HttpHeaders({
          'Authorization': 'Basic ' + btoa('OPENVIDUAPP:joostkinkel'),
          'Content-Type': 'application/json'
        })
      };
      return this.httpClient.post('https://185.107.213.51:4443/api/tokens', body, options)
        .subscribe(response => {
          console.log(response);
          resolve(response['token']);
        });
    });
  }
  createSession(sessionId) {
    return new Promise((resolve, reject) => {

      const body = JSON.stringify({ customSessionId: sessionId });
      const options = {
        headers: new HttpHeaders({
          'Authorization': 'Basic ' + btoa('OPENVIDUAPP:joostkinkel'),
          'Content-Type': 'application/json'
        })
      };
      return this.httpClient.post('https://185.107.213.51:4443/api/sessions', body, options)

        .subscribe(response => {
          console.log(response);
          resolve(response['id']);
        }, (error: any) => {
          if (error.status === 409) {
            resolve(sessionId);
          } else {

          }
        });
    });

  }
}
